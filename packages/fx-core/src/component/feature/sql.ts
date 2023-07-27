// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ContextV3, err, FxError, InputsWithProjectPath, ok, Result } from "@microsoft/teamsfx-api";
import "reflect-metadata";
import { Container, Service } from "typedi";
import { getComponent } from "../workflow";
import "../connection/azureWebAppConfig";
import "../resource/azureSql";
import "../resource/identity";
import { ComponentNames } from "../constants";
import { hasApi, hasTab } from "../../common/projectSettingsHelperV3";
import { convertToAlphanumericOnly } from "../../common/utils";
import { BicepComponent } from "../bicep";
import { AzureSqlResource } from "../resource/azureSql";
import { generateConfigBiceps, bicepUtils, addFeatureNotify } from "../utils";
import { cloneDeep } from "lodash";
import { AzureResourceFunction, AzureResourceSQL } from "../constants";

@Service("sql")
export class Sql {
  name = "sql";

  async add(
    context: ContextV3,
    inputs: InputsWithProjectPath
  ): Promise<Result<undefined, FxError>> {
    const addedResources: string[] = [];
    const sqlComponent = getComponent(context.projectSetting, ComponentNames.AzureSQL);
    if (hasTab(context.projectSetting) && !hasApi(context.projectSetting)) {
      const teamsApi = Container.get(ComponentNames.TeamsApi) as any;
      const res = await teamsApi.add(context, inputs);
      if (res.isErr()) return err(res.error);
    }
    const projectSettings = context.projectSetting;
    const remarks: string[] = [];
    if (!sqlComponent) {
      remarks.push("config 'azure-sql' in projectSettings");
      projectSettings.components.push({
        name: "azure-sql",
        provision: true,
      });
    }

    // generate bicep
    // bicep.init
    {
      const bicepComponent = Container.get<BicepComponent>("bicep");
      const res = await bicepComponent.init(inputs.projectPath);
      if (res.isErr()) return err(res.error);
    }

    // sql bicep
    {
      const provisionType = sqlComponent ? "database" : "server";
      const clonedInputs = cloneDeep(inputs);
      clonedInputs.provisionType = provisionType;
      const sqlResource = Container.get<AzureSqlResource>(ComponentNames.AzureSQL);
      const res = await sqlResource.generateBicep(context, clonedInputs);
      if (res.isErr()) return err(res.error);
      const bicepRes = await bicepUtils.persistBiceps(
        inputs.projectPath,
        convertToAlphanumericOnly(context.projectSetting.appName!),
        res.value
      );
      if (bicepRes.isErr()) return bicepRes;
      remarks.push("generate sql bicep");
    }

    // generate config bicep
    {
      const res = await generateConfigBiceps(context, inputs);
      if (res.isErr()) return err(res.error);
      remarks.push("generate config biceps");
    }
    addedResources.push(AzureResourceSQL.id);
    addFeatureNotify(inputs, context.userInteraction, "Resource", addedResources);
    return ok(undefined);
  }
}
