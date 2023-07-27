// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import {
  ConfigFolderName,
  ContextV3,
  err,
  FxError,
  LogProvider,
  ok,
  PluginContext,
  Result,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import { DependencyChecker, DependencyInfo } from "./dependencyChecker";
import { telemetryHelper } from "../utils/telemetry-helper";
import { TelemetryEvents, TelemetryProperty } from "../utils/telemetryEvents";
import { DependencyValidateError, NpmInstallError } from "../error";
import { cpUtils } from "../../../../common/deps-checker/util/cpUtils";
import { getExecCommand, Utils } from "../utils/utils";
import { Constants } from "../utils/constants";

const name = Constants.YeomanPackageName;
const supportedVersion = "4.3.1";
const displayName = `${name}@${Constants.LatestVersion}`;
const timeout = 6 * 60 * 1000;

export class YoChecker implements DependencyChecker {
  private readonly _logger: LogProvider;

  constructor(logger: LogProvider) {
    this._logger = logger;
  }

  public static getDependencyInfo(): DependencyInfo {
    return { supportedVersion: supportedVersion, displayName: displayName };
  }

  public async ensureDependency(ctx: PluginContext | ContextV3): Promise<Result<boolean, FxError>> {
    telemetryHelper.sendSuccessEvent(ctx, TelemetryEvents.EnsureYoStart);
    try {
      if (!(await this.isInstalled())) {
        this._logger.info(`${displayName} not found, installing...`);
        await this.install();
        this._logger.info(`Successfully installed ${displayName}`);
      }
      telemetryHelper.sendSuccessEvent(ctx, TelemetryEvents.EnsureYo);
    } catch (error) {
      telemetryHelper.sendErrorEvent(
        ctx,
        TelemetryEvents.EnsureYo,
        error as UserError | SystemError,
        { [TelemetryProperty.EnsureYoReason]: (error as UserError | SystemError).name }
      );
      await this._logger.error(`Failed to install 'yo', error = '${error}'`);
      return err(error as UserError | SystemError);
    }

    return ok(true);
  }

  public async ensureLatestDependency(
    ctx: PluginContext | ContextV3
  ): Promise<Result<boolean, FxError>> {
    telemetryHelper.sendSuccessEvent(ctx, TelemetryEvents.EnsureLatestYoStart);
    try {
      this._logger.info(`${displayName} not found, installing...`);
      await this.install();
      this._logger.info(`Successfully installed ${displayName}`);

      telemetryHelper.sendSuccessEvent(ctx, TelemetryEvents.EnsureLatestYo);
    } catch (error) {
      telemetryHelper.sendErrorEvent(
        ctx,
        TelemetryEvents.EnsureLatestYo,
        error as UserError | SystemError,
        {
          [TelemetryProperty.EnsureLatestYoReason]: (error as UserError | SystemError).name,
        }
      );
      await this._logger.error(`Failed to install ${displayName}, error = '${error}'`);
      return err(error as UserError | SystemError);
    }

    return ok(true);
  }

  public async isLatestInstalled(): Promise<boolean> {
    try {
      const yoVersion = await this.queryVersion();
      const latestYeomanVersion = await this.findLatestVersion(5);
      const hasSentinel = await fs.pathExists(this.getSentinelPath());
      return !!latestYeomanVersion && yoVersion === latestYeomanVersion && hasSentinel;
    } catch (error) {
      return false;
    }
  }

  public async isInstalled(): Promise<boolean> {
    let isVersionSupported = false,
      hasSentinel = false;
    try {
      const yoVersion = await this.queryVersion();
      isVersionSupported = yoVersion !== undefined && supportedVersion === yoVersion;
      hasSentinel = await fs.pathExists(this.getSentinelPath());
    } catch (error) {
      return false;
    }
    return isVersionSupported && hasSentinel;
  }

  public async install(): Promise<void> {
    this._logger.info("Start installing...");
    await this.cleanup();
    await this.installYo();

    this._logger.info("Validating package...");
    if (!(await this.validate())) {
      this._logger.debug("Failed to validate yo, cleaning up...");
      await this.cleanup();
      throw DependencyValidateError(name);
    }
  }

  public async getBinFolders(): Promise<string[]> {
    const defaultPath = this.getDefaultInstallPath();
    return [defaultPath, path.join(defaultPath, "node_modules", ".bin")];
  }

  public async findGloballyInstalledVersion(
    timeoutInSeconds?: number
  ): Promise<string | undefined> {
    return await Utils.findGloballyInstalledVersion(this._logger, name, timeoutInSeconds ?? 0);
  }

  public async findLatestVersion(timeoutInSeconds: number): Promise<string | undefined> {
    return await Utils.findLatestVersion(this._logger, name, timeoutInSeconds);
  }

  private async validate(): Promise<boolean> {
    return await fs.pathExists(this.getSentinelPath());
  }

  private getDefaultInstallPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "yo");
  }

  private getSentinelPath(): string {
    return path.join(os.homedir(), `.${ConfigFolderName}`, "yo-sentinel");
  }

  private async queryVersion(): Promise<string | undefined> {
    const packagePath = path.join(
      this.getDefaultInstallPath(),
      "node_modules",
      "yo",
      "package.json"
    );
    if (await fs.pathExists(packagePath)) {
      const packageJson = await fs.readJson(packagePath);
      return packageJson.version ?? undefined;
    }
    return undefined;
  }

  private async cleanup(): Promise<void> {
    try {
      const legacyDirectory = path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "spfx");
      if (fs.existsSync(legacyDirectory)) {
        await fs.emptyDir(legacyDirectory);
        await fs.rmdir(legacyDirectory);
      }

      await fs.emptyDir(this.getDefaultInstallPath());
      await fs.remove(this.getSentinelPath());

      const yoExecutables = [
        "yo",
        "yo.cmd",
        "yo.ps1",
        "yo-complete",
        "yo-complete.cmd",
        "yo-complete.ps1",
      ];
      await Promise.all(
        yoExecutables.map(async (executable) => {
          const executablePath = path.join(this.getDefaultInstallPath(), executable);
          if (await fs.pathExists(executablePath)) {
            await fs.remove(executablePath);
          }
        })
      );
    } catch (err) {
      await this._logger.error(
        `Failed to clean up path: ${this.getDefaultInstallPath()}, error: ${err}`
      );
    }
  }

  private async installYo(): Promise<void> {
    try {
      const version = Constants.LatestVersion;
      await fs.ensureDir(path.join(this.getDefaultInstallPath(), "node_modules"));
      await cpUtils.executeCommand(
        undefined,
        this._logger,
        { timeout: timeout, shell: false },
        getExecCommand("npm"),
        "install",
        `${name}@${version}`,
        "--prefix",
        `${this.getDefaultInstallPath()}`,
        "--no-audit",
        "--global-style"
      );

      await fs.ensureFile(this.getSentinelPath());
    } catch (error) {
      this._logger.error("Failed to execute npm install yo");
      throw NpmInstallError(error as Error);
    }
  }
}
