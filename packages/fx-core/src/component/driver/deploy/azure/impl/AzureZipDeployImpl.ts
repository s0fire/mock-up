// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author FanH <Siglud@gmail.com>
 */
import { AzureDeployImpl } from "./azureDeployImpl";
import {
  AxiosZipDeployResult,
  AzureUploadConfig,
  DeployContext,
  DeployStepArgs,
} from "../../../interface/buildAndDeployArgs";
import { AzureResourceInfo, DriverContext } from "../../../interface/commonArgs";
import { TokenCredential } from "@azure/core-auth";
import { IProgressHandler, LogProvider, UserInteraction } from "@microsoft/teamsfx-api";
import { getLocalizedMessage } from "../../../../messages";
import { DeployConstant, ProgressBarConstant } from "../../../../constant/deployConstant";
import { createHash } from "crypto";
import { default as axios } from "axios";
import { DeployExternalApiCallError } from "../../../../error/deployError";
import { HttpStatusCode } from "../../../../constant/commonConstant";
import { getLocalizedString } from "../../../../../common/localizeUtils";
import path from "path";
import { zipFolderAsync } from "../../../../utils/fileOperation";

export class AzureZipDeployImpl extends AzureDeployImpl {
  pattern =
    /\/subscriptions\/([^\/]*)\/resourceGroups\/([^\/]*)\/providers\/Microsoft.Web\/sites\/([^\/]*)/i;
  private readonly serviceName: string;
  protected helpLink;
  protected summaries: () => string[];
  protected summaryPrepare: () => string[];
  protected zipBuffer: Buffer | undefined;
  protected progressHandler?: AsyncIterableIterator<void>;
  protected progressNames: (() => string)[];
  protected zipFilePath?: string;

  constructor(
    args: unknown,
    context: DriverContext,
    serviceName: string,
    helpLink: string,
    summaries: string[],
    summaryPrepare: string[]
  ) {
    super(args, context);
    this.helpLink = helpLink;
    this.serviceName = serviceName;
    this.summaries = () =>
      summaries.map((summary) => getLocalizedString(summary, this.distDirectory));
    this.summaryPrepare = () =>
      summaryPrepare.map((summary) => getLocalizedString(summary, this.zipFilePath));
    this.progressNames = ProgressBarConstant.ZIP_DEPLOY_IN_AZURE_PROGRESS;
    this.progressPrepare = ProgressBarConstant.DRY_RUN_ZIP_DEPLOY_IN_AZURE_PROGRESS;
  }

  async azureDeploy(
    args: DeployStepArgs,
    azureResource: AzureResourceInfo,
    azureCredential: TokenCredential
  ): Promise<void> {
    const cost = await this.zipDeploy(args, azureResource, azureCredential);
    await this.progressHandler?.next();
    await this.restartFunctionApp(azureResource);
    if (cost > DeployConstant.DEPLOY_OVER_TIME) {
      await this.context.logProvider?.info(
        getLocalizedMessage(
          "driver.deploy.notice.deployAcceleration",
          "https://aka.ms/teamsfx-config-run-from-package"
        ).localized
      );
    }
  }

  protected prepare: (args: DeployStepArgs) => Promise<void> = async (args: DeployStepArgs) => {
    await this.progressHandler?.next();
    await this.packageToZip(args, this.context);
  };

  /**
   * deploy to azure app service or azure function use zip deploy method
   * @param args local file needed to be deployed
   * @param azureResource azure resource info
   * @param azureCredential azure user login credential
   * @return the zip deploy time cost
   * @protected
   */
  public async zipDeploy(
    args: DeployStepArgs,
    azureResource: AzureResourceInfo,
    azureCredential: TokenCredential
  ): Promise<number> {
    await this.progressHandler?.next();
    const zipBuffer = await this.packageToZip(args, this.context);
    await this.progressHandler?.next();
    await this.context.logProvider.debug("Start to get Azure account info for deploy");
    const config = await this.createAzureDeployConfig(azureResource, azureCredential);
    await this.context.logProvider.debug("Get Azure account info for deploy complete");
    await this.progressHandler?.next();
    const endpoint = this.getZipDeployEndpoint(azureResource.instanceId);
    await this.context.logProvider.debug(`Start to upload code to ${endpoint}`);
    await this.progressHandler?.next();
    const startTime = Date.now();
    const location = await this.zipDeployPackage(
      endpoint,
      zipBuffer,
      config,
      this.context.logProvider
    );
    await this.context.logProvider.debug("Upload code to Azure complete");
    await this.progressHandler?.next();
    await this.context.logProvider.debug("Start to check Azure deploy status");
    const deployRes = await this.checkDeployStatus(location, config, this.context.logProvider);
    await this.context.logProvider.debug("Check Azure deploy status complete");
    const cost = Date.now() - startTime;
    this.context.telemetryReporter?.sendTelemetryEvent("deployResponse", {
      time_cost: cost.toString(),
      status: deployRes?.status.toString() ?? "",
      message: deployRes?.message ?? "",
      received_time: deployRes?.received_time ?? "",
      started_time: deployRes?.start_time.toString() ?? "",
      end_time: deployRes?.end_time.toString() ?? "",
      last_success_end_time: deployRes?.last_success_end_time.toString() ?? "",
      complete: deployRes?.complete.toString() ?? "",
      active: deployRes?.active.toString() ?? "",
      is_readonly: deployRes?.is_readonly.toString() ?? "",
      site_name_hash: deployRes?.site_name
        ? createHash("sha256").update(deployRes.site_name).digest("hex")
        : "",
    });
    return cost;
  }

  /**
   * pack dist folder into zip
   * @param args dist folder and ignore files
   * @param context log provider etc..
   * @protected
   */
  protected async packageToZip(args: DeployStepArgs, context: DeployContext): Promise<Buffer> {
    const ig = await this.handleIgnore(args, context);
    this.zipFilePath = path.join(
      this.workingDirectory,
      DeployConstant.DEPLOYMENT_TMP_FOLDER,
      DeployConstant.DEPLOYMENT_ZIP_CACHE_FILE
    );
    await this.context.logProvider?.debug(`start zip dist folder ${this.distDirectory}`);
    const res = await zipFolderAsync(this.distDirectory, this.zipFilePath, ig);
    await this.context.logProvider?.debug(
      `zip dist folder ${this.distDirectory} to ${this.zipFilePath} complete`
    );
    return res;
  }

  /**
   * call azure app service or azure function zip deploy method
   * @param zipDeployEndpoint azure zip deploy endpoint
   * @param zipBuffer zip file buffer
   * @param config azure upload config, including azure account credential
   * @param logger log provider
   * @protected
   */
  protected async zipDeployPackage(
    zipDeployEndpoint: string,
    zipBuffer: Buffer,
    config: AzureUploadConfig,
    logger?: LogProvider
  ): Promise<string> {
    let res: AxiosZipDeployResult;
    let retryCount = 0;
    while (true) {
      try {
        res = await AzureDeployImpl.AXIOS_INSTANCE.post(zipDeployEndpoint, zipBuffer, config);
        break;
      } catch (e) {
        if (axios.isAxiosError(e)) {
          // if the error is remote server error, retry
          if ((e.response?.status ?? HttpStatusCode.OK) >= HttpStatusCode.INTERNAL_SERVER_ERROR) {
            retryCount += 1;
            if (retryCount < DeployConstant.DEPLOY_UPLOAD_RETRY_TIMES) {
              await logger?.warning(
                `Upload zip file failed with response status code: ${
                  e.response?.status ?? "NA"
                }. Retrying...`
              );
            } else {
              // if retry times exceed, throw error
              await logger?.warning(
                `Retry times exceeded. Upload zip file failed with remote server error. Message: ${JSON.stringify(
                  e.response?.data
                )}`
              );
              throw DeployExternalApiCallError.zipDeployWithRemoteError(
                e,
                undefined,
                this.helpLink
              );
            }
          } else {
            // None server error, throw
            await logger?.error(
              `Upload zip file failed with response status code: ${
                e.response?.status ?? "NA"
              }, message: ${JSON.stringify(e.response?.data)}`
            );
            throw DeployExternalApiCallError.zipDeployError(
              e,
              e.response?.status ?? -1,
              this.helpLink
            );
          }
        } else {
          // if the error is not axios error, throw
          await logger?.error(`Upload zip file failed with error: ${JSON.stringify(e)}`);
          throw DeployExternalApiCallError.zipDeployError(e, -1, this.helpLink);
        }
      }
    }

    if (res?.status !== HttpStatusCode.OK && res?.status !== HttpStatusCode.ACCEPTED) {
      if (res?.status) {
        await logger?.error(`Deployment is failed with error code: ${res.status}.`);
      }
      throw DeployExternalApiCallError.zipDeployError(res, res.status, this.helpLink);
    }

    return res.headers.location;
  }

  /**
   * create azure zip deploy endpoint
   * @param siteName azure app service or azure function name
   * @protected
   */
  protected getZipDeployEndpoint(siteName: string): string {
    return `https://${siteName}.scm.azurewebsites.net/api/zipdeploy?isAsync=true`;
  }

  createProgressBar(ui?: UserInteraction): IProgressHandler | undefined {
    return ui?.createProgressBar(
      `Deploying ${this.workingDirectory ?? ""} to ${this.serviceName}`,
      this.progressNames.length
    );
  }
}
