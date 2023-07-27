// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Zhaofeng Xu <zhaofengxu@microsoft.com>
 */

import * as path from "path";
import "mocha";
import {
  getSubscriptionId,
  getTestFolder,
  getUniqueAppName,
  cleanUp,
  readContextMultiEnv,
  setBotSkuNameToB1Bicep,
  setSimpleAuthSkuNameToB1Bicep,
} from "../commonUtils";
import { environmentManager } from "@microsoft/teamsfx-core/build/core/environment";
import { isPreviewFeaturesEnabled } from "@microsoft/teamsfx-core/build/common/featureFlags";
import { CliHelper } from "../../commonlib/cliHelper";
import { Capability } from "../../commonlib/constants";
import { BotValidator } from "../../commonlib";
import { it } from "@microsoft/extra-shot-mocha";
import { isV3Enabled } from "@microsoft/teamsfx-core";

describe("Configuration successfully changed when with different plugins", function () {
  const testFolder = getTestFolder();
  const subscription = getSubscriptionId();
  const appName = getUniqueAppName();
  const projectPath = path.resolve(testFolder, appName);
  const env = environmentManager.getDefaultEnvName();

  after(async () => {
    await cleanUp(appName, projectPath, true, true, false);
  });

  it(`bot + tab`, { testPlanCaseId: 15685606 }, async function () {
    if (isV3Enabled()) {
      this.skip();
    }
    await CliHelper.createProjectWithCapability(appName, testFolder, Capability.Bot);
    if (isPreviewFeaturesEnabled()) {
      await CliHelper.addCapabilityToProject(projectPath, Capability.SSOTab);
    } else {
      await CliHelper.addCapabilityToProject(projectPath, Capability.Tab);
    }

    // Provision
    await setSimpleAuthSkuNameToB1Bicep(projectPath, env);
    await setBotSkuNameToB1Bicep(projectPath, env);
    await CliHelper.setSubscription(subscription, projectPath);
    await CliHelper.provisionProject(projectPath);

    // Assert
    {
      const context = await readContextMultiEnv(projectPath, env);

      // Validate Function App
      const bot = new BotValidator(context, projectPath, env);
      await bot.validateProvision();
    }
  });
});