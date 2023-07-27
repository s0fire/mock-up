// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Result, err, ok, Platform } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { hooks } from "@feathersjs/hooks/lib";
import isUUID from "validator/lib/isUUID";
import { merge } from "lodash";
import { StepDriver, ExecutionResult } from "../interface/stepDriver";
import { DriverContext } from "../interface/commonArgs";
import { WrapDriverContext } from "../util/wrapUtil";
import { ConfigureTeamsAppArgs } from "./interfaces/ConfigureTeamsAppArgs";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { AppStudioClient } from "../../resource/appManifest/appStudioClient";
import { AppStudioResultFactory } from "../../resource/appManifest/results";
import { TelemetryUtils } from "../../resource/appManifest/utils/telemetry";
import { manifestUtils } from "../../resource/appManifest/utils/ManifestUtils";
import { AppStudioError } from "../../resource/appManifest/errors";
import { AppStudioScopes } from "../../../common/tools";
import { getLocalizedString } from "../../../common/localizeUtils";
import { TelemetryProperty } from "../../../common/telemetry";
import { Service } from "typedi";
import { getAbsolutePath } from "../../utils/common";
import { FileNotFoundError, InvalidActionInputError } from "../../../error/common";
import { updateProgress } from "../middleware/updateProgress";

export const actionName = "teamsApp/update";

export const defaultOutputNames = {
  teamsAppId: "TEAMS_APP_ID",
};

export const internalOutputNames = {
  teamsAppUpdateTime: "TEAMS_APP_UPDATE_TIME",
  teamsAppTenantId: "TEAMS_APP_TENANT_ID",
};

@Service(actionName)
export class ConfigureTeamsAppDriver implements StepDriver {
  description = getLocalizedString("driver.teamsApp.description.updateDriver");

  public async run(
    args: ConfigureTeamsAppArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.update(args, wrapContext);
    return res;
  }

  public async execute(
    args: ConfigureTeamsAppArgs,
    context: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.update(args, wrapContext, outputEnvVarNames);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  @hooks([
    addStartAndEndTelemetry(actionName, actionName),
    updateProgress(getLocalizedString("driver.teamsApp.progressBar.updateTeamsAppStepMessage")),
  ])
  async update(
    args: ConfigureTeamsAppArgs,
    context: WrapDriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<Result<Map<string, string>, FxError>> {
    TelemetryUtils.init(context);

    const result = this.validateArgs(args);
    if (result.isErr()) {
      return err(result.error);
    }

    if (!outputEnvVarNames) {
      outputEnvVarNames = new Map(Object.entries(defaultOutputNames));
    }
    outputEnvVarNames = new Map([...outputEnvVarNames, ...Object.entries(internalOutputNames)]);

    const appStudioTokenRes = await context.m365TokenProvider.getAccessToken({
      scopes: AppStudioScopes,
    });
    if (appStudioTokenRes.isErr()) {
      return err(appStudioTokenRes.error);
    }
    const appStudioToken = appStudioTokenRes.value;
    const appPackagePath = getAbsolutePath(args.appPackagePath, context.projectPath);
    if (!(await fs.pathExists(appPackagePath))) {
      return err(
        new FileNotFoundError(
          actionName,
          appPackagePath,
          "https://aka.ms/teamsfx-actions/teamsapp-update"
        )
      );
    }
    const archivedFile = await fs.readFile(appPackagePath);

    // Add capabilities to telemetry properties
    const manifest = manifestUtils.extractManifestFromArchivedFile(archivedFile);
    if (manifest.isErr()) {
      return err(manifest.error);
    }
    const capabilities = manifestUtils._getCapabilities(manifest.value).map((x) => {
      if (x == "staticTab" || x == "configurableTab") {
        return "Tab";
      } else {
        return x;
      }
    });
    merge(context.telemetryProperties, {
      [TelemetryProperty.Capabilities]: [...new Set(capabilities)].join(";"),
    });

    // Fail if Teams app not exists, as this action only update the Teams app, not create
    // See work item 17187087
    const teamsAppId = manifest.value.id;
    if (!isUUID(teamsAppId)) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.InvalidTeamsAppIdError.name,
          AppStudioError.InvalidTeamsAppIdError.message(teamsAppId),
          "https://aka.ms/teamsfx-actions/teamsapp-update"
        )
      );
    }
    try {
      await AppStudioClient.getApp(teamsAppId, appStudioToken, context.logProvider);
    } catch (error) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppNotExistsError.name,
          AppStudioError.TeamsAppNotExistsError.message(teamsAppId),
          "https://aka.ms/teamsfx-actions/teamsapp-update"
        )
      );
    }

    try {
      let message = getLocalizedString("driver.teamsApp.progressBar.updateTeamsAppStepMessage");

      const appDefinition = await AppStudioClient.importApp(
        archivedFile,
        appStudioToken,
        context.logProvider,
        true
      );
      message = getLocalizedString(
        "plugins.appstudio.teamsAppUpdatedLog",
        appDefinition.teamsAppId!
      );
      context.logProvider.info(message);
      context.addSummary(message);
      return ok(
        new Map([
          [outputEnvVarNames.get("teamsAppId") as string, appDefinition.teamsAppId!],
          [outputEnvVarNames.get("teamsAppTenantId") as string, appDefinition.tenantId!],
          [outputEnvVarNames.get("teamsAppUpdateTime") as string, appDefinition.updatedAt!],
        ])
      );
    } catch (e: any) {
      return err(
        AppStudioResultFactory.SystemError(
          AppStudioError.TeamsAppUpdateFailedError.name,
          AppStudioError.TeamsAppUpdateFailedError.message(teamsAppId),
          "https://aka.ms/teamsfx-actions/teamsapp-update"
        )
      );
    }
  }

  private validateArgs(args: ConfigureTeamsAppArgs): Result<any, FxError> {
    const invalidParams: string[] = [];
    if (!args || !args.appPackagePath) {
      invalidParams.push("appPackagePath");
    }
    if (invalidParams.length > 0) {
      return err(
        new InvalidActionInputError(
          actionName,
          invalidParams,
          "https://aka.ms/teamsfx-actions/teamsapp-update"
        )
      );
    } else {
      return ok(undefined);
    }
  }
}
