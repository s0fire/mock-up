// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Huihui Wu <huihuiwu@microsoft.com>
 */

import * as fs from "fs-extra";
import * as path from "path";
import { expect, assert } from "chai";
import {
  cleanUpLocalProject,
  cleanupSharePointPackage,
  getTestFolder,
  getUniqueAppName,
  readContextMultiEnv,
  readContextMultiEnvV3,
} from "../commonUtils";
import { AppStudioValidator, SharepointValidator } from "../../commonlib";
import { environmentManager, isV3Enabled, ProgrammingLanguage } from "@microsoft/teamsfx-core";
import { it } from "@microsoft/extra-shot-mocha";
import { Executor } from "../../utils/executor";
import { Capability } from "../../utils/constants";

describe("Start a new project", function () {
  let appId: string;
  let appName: string;
  let testFolder: string;
  let projectPath: string;
  let teamsAppId: string | undefined;
  beforeEach(async () => {
    testFolder = getTestFolder();
    appName = getUniqueAppName();
    projectPath = path.resolve(testFolder, appName);
  });

  it(
    "Create, provision and run SPFx project with React framework",
    { testPlanCaseId: 15687302 },
    async function () {
      {
        const result = await Executor.createProject(
          testFolder,
          appName,
          Capability.SPFxTab,
          ProgrammingLanguage.TS
        );

        // check specified files
        const files: string[] = [
          "config/config.json",
          "config/deploy-azure-storage.json",
          "config/package-solution.json",
          "config/serve.json",
          "config/write-manifests.json",
          "src/webparts/helloworld/HelloworldWebPart.manifest.json",
          "src/webparts/helloworld/HelloworldWebPart.ts",
          "src/webparts/helloworld/loc/en-us.js",
          "src/webparts/helloworld/loc/mystrings.d.ts",
          "src/webparts/helloworld/assets/welcome-dark.png",
          "src/webparts/helloworld/assets/welcome-light.png",
          "src/webparts/helloworld/components/Helloworld.module.scss",
          "src/webparts/helloworld/components/Helloworld.tsx",
          "src/webparts/helloworld/components/IHelloworldProps.ts",
          "src/index.ts",
          ".gitignore",
          ".npmignore",
          ".yo-rc.json",
          "gulpfile.js",
          "package.json",
          "README.md",
          "tsconfig.json",
        ];
        for (const file of files) {
          const filePath = path.join(testFolder, appName, isV3Enabled() ? `src` : `SPFx`, file);
          expect(fs.existsSync(filePath), `${filePath} must exist.`).to.eq(true);
        }
        expect(result.success).to.be.true;
      }

      {
        // validation succeed without provision
        const result = await Executor.validate(projectPath, environmentManager.getDefaultEnvName());
        expect(result.success).to.be.true;
      }

      {
        // validation local env succeed without local debug
        const result = await Executor.validate(projectPath, environmentManager.getLocalEnvName());
        expect(result.success).to.be.true;
      }

      {
        // provision
        const result = await Executor.provision(
          projectPath,
          environmentManager.getDefaultEnvName()
        );
        expect(result.success).to.be.true;
      }

      {
        // Get context
        const context = isV3Enabled()
          ? await readContextMultiEnvV3(projectPath, environmentManager.getDefaultEnvName())
          : await readContextMultiEnv(projectPath, environmentManager.getDefaultEnvName());

        if (isV3Enabled()) {
          assert.exists(context.TEAMS_APP_ID);
          teamsAppId = context.TEAMS_APP_ID;
          AppStudioValidator.setE2ETestProvider();
        } else {
          // Only check Teams App existence
          const appStudio = AppStudioValidator.init(context);
          AppStudioValidator.validateTeamsAppExist(appStudio);
          teamsAppId = appStudio.teamsAppId;
        }
      }

      {
        // deploy
        const result = await Executor.deploy(projectPath, environmentManager.getDefaultEnvName());
        expect(result.success).to.be.true;
      }

      {
        // Validate sharepoint package
        const solutionConfig = await fs.readJson(
          `${projectPath}/${isV3Enabled() ? `src` : `SPFx`}/config/package-solution.json`
        );
        const sharepointPackage = `${projectPath}/${isV3Enabled() ? `src` : `SPFx`}/sharepoint/${
          solutionConfig.paths.zippedPackage
        }`;
        appId = solutionConfig["solution"]["id"];
        expect(appId).to.not.be.empty;
        expect(await fs.pathExists(sharepointPackage)).to.be.true;

        // Check if package exsist in App Catalog
        SharepointValidator.init();
        SharepointValidator.validateDeploy(appId);
      }

      {
        // publish
        const result = await Executor.publish(projectPath, environmentManager.getDefaultEnvName());
        expect(result.success).to.be.true;
      }

      {
        // Validate publish result
        await AppStudioValidator.validatePublish(teamsAppId!);
      }
    }
  );

  afterEach(async () => {
    // clean up
    await cleanUpLocalProject(projectPath);
    await cleanupSharePointPackage(appId);
    await AppStudioValidator.cancelStagedAppInTeamsAppCatalog(teamsAppId);
  });
});
