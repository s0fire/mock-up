// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Result, FxError, IStaticTab, Inputs, Stage } from "@microsoft/teamsfx-api";
import { hooks } from "@feathersjs/hooks/lib";
import { Service } from "typedi";
import { StepDriver, ExecutionResult } from "../interface/stepDriver";
import { DriverContext } from "../interface/commonArgs";
import { WrapDriverContext } from "../util/wrapUtil";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { manifestUtils } from "../../resource/appManifest/utils/ManifestUtils";
import { getLocalizedString } from "../../../common/localizeUtils";
import { wrapRun } from "../../utils/common";
import { AddWebPartArgs } from "./interface/AddWebPartArgs";
import path from "path";
import * as fs from "fs-extra";
import * as util from "util";
import { ManifestTemplate } from "../../resource/spfx/utils/constants";
import { SPFxGenerator } from "../../generator/spfxGenerator";
import { createContextV3 } from "../../utils";
import { Constants } from "./utility/constants";
import { NoConfigurationError } from "./error/noConfigurationError";
import { SPFxQuestionNames } from "../../constants";
import { SPFXQuestionNames } from "../../resource/spfx/utils/questions";

@Service(Constants.ActionName)
export class AddWebPartDriver implements StepDriver {
  description = getLocalizedString("driver.spfx.add.description");

  @hooks([addStartAndEndTelemetry(Constants.ActionName, Constants.ActionName)])
  public async run(
    args: AddWebPartArgs,
    context: DriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    const wrapContext = new WrapDriverContext(context, Constants.ActionName, Constants.ActionName);
    return wrapRun(() => this.add(args, wrapContext));
  }

  public async execute(args: AddWebPartArgs, context: DriverContext): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, Constants.ActionName, Constants.ActionName);
    const res = await this.run(args, wrapContext);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  public async add(args: AddWebPartArgs, context: WrapDriverContext): Promise<Map<string, string>> {
    const webpartName = args.webpartName;
    const spfxFolder = args.spfxFolder;
    const manifestPath = args.manifestPath;
    const localManifestPath = args.localManifestPath;
    const spfxPackage = args.spfxPackage;

    const yorcPath = path.join(spfxFolder, Constants.YO_RC_FILE);
    if (!(await fs.pathExists(yorcPath))) {
      throw new NoConfigurationError();
    }

    const inputs: Inputs = { platform: context.platform, stage: Stage.addWebpart };
    inputs[SPFxQuestionNames.WebPartName] = webpartName;
    inputs[SPFxQuestionNames.SPFxFolder] = spfxFolder;
    inputs[SPFxQuestionNames.ManifestPath] = manifestPath;
    inputs[SPFxQuestionNames.LocalManifestPath] = localManifestPath;
    inputs[SPFXQuestionNames.use_global_package_or_install_local] = spfxPackage;
    const yeomanRes = await SPFxGenerator.doYeomanScaffold(
      createContextV3(),
      inputs,
      context.projectPath
    );
    if (yeomanRes.isErr()) throw yeomanRes.error;

    const componentId = yeomanRes.value;
    const remoteStaticSnippet: IStaticTab = {
      entityId: componentId,
      name: webpartName,
      contentUrl: util.format(Constants.REMOTE_CONTENT_URL, componentId),
      websiteUrl: ManifestTemplate.WEBSITE_URL,
      scopes: ["personal"],
    };
    const localStaticSnippet: IStaticTab = {
      entityId: componentId,
      name: webpartName,
      contentUrl: util.format(Constants.LOCAL_CONTENT_URL, componentId),
      websiteUrl: ManifestTemplate.WEBSITE_URL,
      scopes: ["personal"],
    };

    inputs["addManifestPath"] = localManifestPath;
    const localRes = await manifestUtils.addCapabilities(
      { ...inputs, projectPath: context.projectPath },
      [{ name: "staticTab", snippet: localStaticSnippet }]
    );
    if (localRes.isErr()) throw localRes.error;

    inputs["addManifestPath"] = manifestPath;
    const remoteRes = await manifestUtils.addCapabilities(
      { ...inputs, projectPath: context.projectPath },
      [{ name: "staticTab", snippet: remoteStaticSnippet }]
    );
    if (remoteRes.isErr()) throw remoteRes.error;

    context.ui?.showMessage(
      "info",
      getLocalizedString("driver.spfx.add.successNotice", webpartName),
      false
    );
    return new Map();
  }
}
