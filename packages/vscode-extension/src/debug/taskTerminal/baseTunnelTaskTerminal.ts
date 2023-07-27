/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @author Xiaofu Huang <xiaofhua@microsoft.com>
 */
import * as util from "util";
import * as vscode from "vscode";
import { assembleError, err, FxError, ok, Result, UserError, Void } from "@microsoft/teamsfx-api";
import { envUtil, isV3Enabled, TunnelType } from "@microsoft/teamsfx-core";
import { Correlator } from "@microsoft/teamsfx-core/build/common/correlator";
import { LocalTelemetryReporter } from "@microsoft/teamsfx-core/build/common/local";
import { DotenvOutput } from "@microsoft/teamsfx-core/build/component/utils/envUtil";
import { pathUtils } from "@microsoft/teamsfx-core/build/component/utils/pathUtils";
import VsCodeLogInstance from "../../commonlib/log";
import { ExtensionErrors, ExtensionSource } from "../../error";
import * as globalVariables from "../../globalVariables";
import { ProgressHandler } from "../../progressHandler";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
} from "../../telemetry/extTelemetryEvents";
import { getDefaultString, localize } from "../../utils/localizeUtils";
import { getLocalDebugSession, Step } from "../commonUtils";
import { baseTunnelDisplayMessages, TunnelDisplayMessages } from "../constants";
import { doctorConstant } from "../depsChecker/doctorConstant";
import { localTelemetryReporter } from "../localTelemetryReporter";
import { BaseTaskTerminal } from "./baseTaskTerminal";

export interface IBaseTunnelArgs {
  type?: string;
  env?: string;
}

export type OutputInfo = {
  file: string | undefined;
  keys: string[];
};

export type EndpointInfo = {
  src: string;
  dest: string;
};

export abstract class BaseTunnelTaskTerminal extends BaseTaskTerminal {
  protected static tunnelTaskTerminals: Map<string, BaseTunnelTaskTerminal> = new Map<
    string,
    BaseTunnelTaskTerminal
  >();

  protected outputMessageList: string[];

  protected readonly progressHandler: ProgressHandler;
  protected readonly step: Step;

  constructor(taskDefinition: vscode.TaskDefinition, stepNumber: number) {
    super(taskDefinition);

    for (const terminal of BaseTunnelTaskTerminal.tunnelTaskTerminals.values()) {
      terminal.close();
    }

    BaseTunnelTaskTerminal.tunnelTaskTerminals.set(this.taskTerminalId, this);

    this.progressHandler = new ProgressHandler(
      baseTunnelDisplayMessages.taskName,
      stepNumber,
      "terminal"
    );
    this.step = new Step(stepNumber);
    this.outputMessageList = [];
  }

  public do(): Promise<Result<Void, FxError>> {
    return Correlator.runWithId(getLocalDebugSession().id, () =>
      localTelemetryReporter.runWithTelemetryProperties(
        TelemetryEvent.DebugStartLocalTunnelTask,
        this.generateTelemetries(),
        () => this._do()
      )
    );
  }

  public static async stopAll(): Promise<void> {
    for (const task of BaseTunnelTaskTerminal.tunnelTaskTerminals.values()) {
      task.close();
    }
  }

  protected abstract generateTelemetries(): { [key: string]: string };
  protected abstract _do(): Promise<Result<Void, FxError>>;

  protected async resolveArgs(args: IBaseTunnelArgs): Promise<void> {
    if (!args) {
      throw BaseTaskTerminal.taskDefinitionError("args");
    }

    if (args.type) {
      if (
        typeof args.type !== "string" ||
        !(Object.values(TunnelType) as string[]).includes(args.type)
      ) {
        throw BaseTaskTerminal.taskDefinitionError("args.type");
      }
    }

    if (isV3Enabled()) {
      if (typeof args.env !== "undefined" && typeof args.env !== "string") {
        throw BaseTaskTerminal.taskDefinitionError("args.env");
      }
    }
  }

  protected async outputStartMessage(tunnelDisplayMessages: TunnelDisplayMessages): Promise<void> {
    VsCodeLogInstance.info(tunnelDisplayMessages.title());
    VsCodeLogInstance.outputChannel.appendLine("");
    VsCodeLogInstance.outputChannel.appendLine(
      tunnelDisplayMessages.checkNumber(this.step.totalSteps)
    );
    VsCodeLogInstance.outputChannel.appendLine("");

    this.writeEmitter.fire(`${tunnelDisplayMessages.startTerminalMessage}\r\n\r\n`);

    await this.progressHandler.start();
  }

  protected async outputSuccessSummary(
    tunnelDisplayMessages: TunnelDisplayMessages,
    tunnelInfoArr: EndpointInfo[],
    envs: OutputInfo
  ): Promise<void> {
    const duration = this.getDurationInSeconds();
    VsCodeLogInstance.outputChannel.appendLine(tunnelDisplayMessages.summary());
    VsCodeLogInstance.outputChannel.appendLine("");

    for (const outputMessage of this.outputMessageList) {
      VsCodeLogInstance.outputChannel.appendLine(`${doctorConstant.Tick} ${outputMessage}`);
    }

    let isFirstTunnel = true;
    for (const tunnelInfo of tunnelInfoArr) {
      VsCodeLogInstance.outputChannel.appendLine(
        `${
          isFirstTunnel ? doctorConstant.Tick : doctorConstant.TickWhiteSpace
        } ${tunnelDisplayMessages.successSummary(
          tunnelInfo.src,
          tunnelInfo.dest,
          envs.file,
          envs.keys
        )}`
      );
      isFirstTunnel = false;
    }

    VsCodeLogInstance.outputChannel.appendLine("");
    VsCodeLogInstance.outputChannel.appendLine(
      tunnelDisplayMessages.learnMore(tunnelDisplayMessages.learnMoreHelpLink)
    );
    VsCodeLogInstance.outputChannel.appendLine("");
    if (duration) {
      VsCodeLogInstance.info(tunnelDisplayMessages.durationMessage(duration));
    }

    for (const tunnelInfo of tunnelInfoArr) {
      this.writeEmitter.fire(
        `\r\n${tunnelDisplayMessages.terminalSuccessSummary(
          tunnelInfo.src,
          tunnelInfo.dest,
          envs.file,
          envs.keys
        )}\r\n`
      );
    }
    this.writeEmitter.fire(`\r\n${tunnelDisplayMessages.successTerminalMessage}\r\n\r\n`);

    await this.progressHandler.end(true);

    localTelemetryReporter.sendTelemetryEvent(
      TelemetryEvent.DebugStartLocalTunnelTaskStarted,
      Object.assign(
        { [TelemetryProperty.Success]: TelemetrySuccess.Yes },
        this.generateTelemetries()
      ),
      {
        [LocalTelemetryReporter.PropertyDuration]: duration ?? -1,
      }
    );
  }

  protected async outputFailureSummary(
    tunnelDisplayMessages: TunnelDisplayMessages,
    error?: any
  ): Promise<void> {
    const fxError = error ? assembleError(error) : TunnelError.StartTunnelError();
    VsCodeLogInstance.outputChannel.appendLine(tunnelDisplayMessages.summary());

    VsCodeLogInstance.outputChannel.appendLine("");
    for (const outputMessage of this.outputMessageList) {
      VsCodeLogInstance.outputChannel.appendLine(`${doctorConstant.Tick} ${outputMessage}`);
    }

    VsCodeLogInstance.outputChannel.appendLine(`${doctorConstant.Cross} ${fxError.message}`);

    VsCodeLogInstance.outputChannel.appendLine("");
    VsCodeLogInstance.outputChannel.appendLine(
      tunnelDisplayMessages.learnMore(tunnelDisplayMessages.learnMoreHelpLink)
    );
    VsCodeLogInstance.outputChannel.appendLine("");

    this.writeEmitter.fire(`\r\n${tunnelDisplayMessages.errorTerminalMessage}\r\n`);

    await this.progressHandler.end(false);

    localTelemetryReporter.sendTelemetryErrorEvent(
      TelemetryEvent.DebugStartLocalTunnelTaskStarted,
      fxError,
      Object.assign(
        {
          [TelemetryProperty.Success]: TelemetrySuccess.No,
        },
        this.generateTelemetries()
      ),
      {
        [LocalTelemetryReporter.PropertyDuration]: this.getDurationInSeconds() ?? -1,
      }
    );
  }

  protected async savePropertiesToEnv(
    env: string | undefined,
    envVars: {
      [key: string]: string;
    }
  ): Promise<Result<OutputInfo, FxError>> {
    try {
      const result: OutputInfo = {
        file: undefined,
        keys: [],
      };
      if (!isV3Enabled() || !globalVariables.workspaceUri?.fsPath || !env) {
        return ok(result);
      }

      if (Object.entries(envVars).length === 0) {
        return ok(result);
      }

      result.keys = Object.keys(envVars);
      const res = await envUtil.writeEnv(globalVariables.workspaceUri.fsPath, env, envVars);
      const envFilePathResult = await pathUtils.getEnvFilePath(
        globalVariables.workspaceUri.fsPath,
        env
      );
      if (envFilePathResult.isOk()) {
        result.file = envFilePathResult.value;
      }
      return res.isOk() ? ok(result) : err(res.error);
    } catch (error: any) {
      return err(TunnelError.TunnelEnvError(error));
    }
  }

  protected async readPropertiesFromEnv(
    env: string | undefined
  ): Promise<Result<DotenvOutput, FxError>> {
    if (!isV3Enabled() || !globalVariables.workspaceUri?.fsPath || !env) {
      return ok({});
    }
    return await envUtil.readEnv(globalVariables.workspaceUri.fsPath, env);
  }
}

export const TunnelError = Object.freeze({
  TunnelEnvError: (error: any) =>
    new UserError(
      ExtensionSource,
      ExtensionErrors.TunnelEnvError,
      util.format(getDefaultString("teamstoolkit.localDebug.tunnelEnvError"), error?.message ?? ""),
      util.format(localize("teamstoolkit.localDebug.tunnelEnvError"), error?.message ?? "")
    ),
  StartTunnelError: (error?: any) =>
    new UserError(
      ExtensionSource,
      ExtensionErrors.StartTunnelError,
      util.format(
        getDefaultString("teamstoolkit.localDebug.startTunnelError"),
        error?.message ?? ""
      ),
      util.format(localize("teamstoolkit.localDebug.startTunnelError"), error?.message ?? "")
    ),
});
