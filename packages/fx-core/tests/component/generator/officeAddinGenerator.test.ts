// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import {
  ContextV3,
  devPreview,
  err,
  Inputs,
  LocalFunc,
  ManifestUtil,
  ok,
  Platform,
  SystemError,
} from "@microsoft/teamsfx-api";
import * as chai from "chai";
import fs from "fs";
import * as fse from "fs-extra";
import axios from "axios";
import "mocha";
import mockfs from "mock-fs";
import * as path from "path";
import * as sinon from "sinon";
import * as uuid from "uuid";
import * as unzip from "unzipper";
import { cpUtils } from "../../../src/common/deps-checker";
import { Generator } from "../../../src/component/generator/generator";
import { OfficeAddinGenerator } from "../../../src/component/generator/officeAddin/generator";
import {
  AddinLanguageQuestion,
  AddinProjectFolderQuestion,
  AddinProjectManifestQuestion,
  getQuestionsForScaffolding,
  getTemplate,
  OfficeHostQuestion,
} from "../../../src/component/generator/officeAddin/question";
import { GeneratorChecker } from "../../../src/component/resource/spfx/depsChecker/generatorChecker";
import { YoChecker } from "../../../src/component/resource/spfx/depsChecker/yoChecker";
import * as childProcess from "child_process";
import { Utils } from "../../../src/component/resource/spfx/utils/utils";
import { createContextV3, newProjectSettingsV3 } from "../../../src/component/utils";
import { setTools } from "../../../src/core/globalVars";
import { MockTools } from "../../core/utils";
import { HelperMethods } from "../../../src/component/generator/officeAddin/helperMethods";
import { OfficeAddinManifest } from "office-addin-manifest";
import { manifestUtils } from "../../../src/component/resource/appManifest/utils/ManifestUtils";
import projectsJsonData from "../../../src/component/generator/officeAddin/config/projectsJsonData";
import EventEmitter from "events";
import proxyquire from "proxyquire";
import mockedEnv, { RestoreFn } from "mocked-env";

describe("OfficeAddinGenerator", function () {
  const testFolder = path.resolve("./tmp");
  let context: ContextV3;
  let mockedEnvRestore: RestoreFn;
  const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

  beforeEach(async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_V3: "true" }, { clear: true });
    const gtools = new MockTools();
    setTools(gtools);
    context = createContextV3(newProjectSettingsV3());

    await fse.ensureDir(testFolder);
    sinon.stub(Utils, "configure");
    sinon.stub(fs, "stat").resolves();
    sinon.stub(YoChecker.prototype, "isInstalled").resolves(true);
    sinon.stub(GeneratorChecker.prototype, "isInstalled").resolves(true);
    sinon.stub(cpUtils, "executeCommand").resolves("succeed");
    const manifestId = uuid.v4();
    sinon.stub(fs, "readFile").resolves(new Buffer(`{"id": "${manifestId}"}`));
    sinon.stub(fs, "writeFile").resolves();
    sinon.stub(fs, "rename").resolves();
    sinon.stub(fs, "copyFile").resolves();
    sinon.stub(fse, "remove").resolves();
    sinon.stub(fse, "readJson").resolves({});
    sinon.stub(fse, "ensureFile").resolves();
    sinon.stub(fse, "writeJSON").resolves();
  });

  it("should run childProcessExec command success", async function () {
    sinon.stub(childProcess, "exec").yields(`echo 'test'`, "test");
    chai.assert(await OfficeAddinGenerator.childProcessExec(`echo 'test'`), "test");
  });

  it("should throw error once command fail", async function () {
    try {
      await OfficeAddinGenerator.childProcessExec("exit -1");
    } catch (err) {
      chai.assert(err.message, "Command failed: exit -1");
    }
  });

  it("should call both doScaffolding and template generator", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    const doScaffoldStub = sinon
      .stub(OfficeAddinGenerator, "doScaffolding")
      .resolves(ok(undefined));
    const generateTemplateStub = sinon.stub(Generator, "generateTemplate").resolves(ok(undefined));

    const result = await OfficeAddinGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(doScaffoldStub.calledOnce).to.be.true;
    chai.expect(generateTemplateStub.calledOnce).to.be.true;
  });

  it("should return error if doScaffolding() returns error", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    sinon.stub(OfficeAddinGenerator, "doScaffolding").resolves(err(mockedError));
    sinon.stub(Generator, "generateTemplate").resolves(ok(undefined));

    const result = await OfficeAddinGenerator.generate(context, inputs, testFolder);

    chai.assert.isTrue(result.isErr() && result.error.name === "mockedError");
  });

  it("should call both doScaffolding and template generator", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    sinon.stub(OfficeAddinGenerator, "doScaffolding").resolves(ok(undefined));
    sinon.stub(Generator, "generateTemplate").resolves(err(mockedError));

    const result = await OfficeAddinGenerator.generate(context, inputs, testFolder);

    chai.assert.isTrue(result.isErr() && result.error.name === "mockedError");
  });

  it("should scaffold taskpane successfully on happy path", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    inputs["capabilities"] = ["taskpane"];
    inputs[AddinProjectFolderQuestion.name] = undefined;
    inputs[AddinLanguageQuestion.name] = "TypeScript";

    sinon.stub(OfficeAddinGenerator, "childProcessExec").resolves();
    sinon.stub(HelperMethods, "downloadProjectTemplateZipFile").resolves(undefined);
    sinon.stub(OfficeAddinManifest, "modifyManifestFile").resolves({});
    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("should copy addin files and updateManifest if addin folder is specified with json manifest", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    inputs["capabilities"] = ["taskpane"];
    inputs[AddinProjectFolderQuestion.name] = "somepath";
    inputs[AddinLanguageQuestion.name] = "TypeScript";
    inputs[AddinProjectManifestQuestion.name] = "manifest.json";

    const copyAddinFilesStub = sinon
      .stub(HelperMethods, "copyAddinFiles")
      .callsFake((from: string, to: string) => {
        return;
      });
    const updateManifestStub = sinon
      .stub(HelperMethods, "updateManifest")
      .callsFake(async (destination: string, manifestPath: string) => {
        return;
      });

    sinon.stub<any, any>(ManifestUtil, "loadFromPath").resolves({
      extensions: [
        {
          requirements: {
            scopes: ["mail"],
          },
        },
      ],
    });

    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(copyAddinFilesStub.calledOnce).to.be.true;
    chai.expect(updateManifestStub.calledOnce).to.be.true;
    chai.expect(inputs[OfficeHostQuestion.name]).to.eq("Outlook");
  });

  it("should copy addin files and convert manifest if addin folder is specified with xml manifest", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    inputs["capabilities"] = ["taskpane"];
    inputs[AddinProjectFolderQuestion.name] = "somepath";
    inputs[AddinLanguageQuestion.name] = "TypeScript";
    inputs[AddinProjectManifestQuestion.name] = "manifest.xml";

    const copyAddinFilesStub = sinon
      .stub(HelperMethods, "copyAddinFiles")
      .callsFake((from: string, to: string) => {
        return;
      });
    const updateManifestStub = sinon
      .stub(HelperMethods, "updateManifest")
      .callsFake(async (destination: string, manifestPath: string) => {
        return;
      });
    const convertProjectStub = sinon
      .stub()
      .callsFake(async (manifestPath?: string, backupPath?: string) => {
        return;
      });

    const generator = proxyquire("../../../src/component/generator/officeAddin/generator", {
      "office-addin-project": {
        convertProject: convertProjectStub,
      },
    });

    sinon.stub<any, any>(ManifestUtil, "loadFromPath").resolves({
      extensions: [
        {
          requirements: {
            scopes: ["mail"],
          },
        },
      ],
    });

    const result = await generator.OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(copyAddinFilesStub.calledOnce).to.be.true;
    chai.expect(updateManifestStub.calledOnce).to.be.true;
    chai.expect(convertProjectStub.calledOnce).to.be.true;
    chai.expect(inputs[OfficeHostQuestion.name]).to.eq("Outlook");
  });

  afterEach(async () => {
    sinon.restore();
    mockedEnvRestore();
  });
});

describe("getQuestionsForScaffolding", () => {
  it("should contain all questions", () => {
    const q = getQuestionsForScaffolding();
    chai.expect(q.children?.length).to.eq(2);
    chai.expect(q.children?.[0].condition).is.not.undefined;
    chai.expect(q.children?.[0].condition).has.property("validFunc");
  });

  describe("AddinLanguageQuestions", () => {
    it("should have typescript as options", async () => {
      const inputs: Inputs = { platform: Platform.CLI };
      inputs["capabilities"] = ["taskpane"];
      chai.assert.isDefined(AddinLanguageQuestion.dynamicOptions);
      const options = await AddinLanguageQuestion.dynamicOptions!(inputs);
      chai.assert.deepEqual(options, [{ label: "TypeScript", id: "TypeScript" }]);
    });

    it("should default to TypeScript for taskpane projects", async () => {
      const inputs: Inputs = { platform: Platform.CLI };
      inputs["capabilities"] = ["taskpane"];
      chai.assert.isDefined(AddinLanguageQuestion.default);
      const lang = await (AddinLanguageQuestion.default as LocalFunc<string | undefined>)(inputs);
      chai.assert.equal(lang, "TypeScript");
    });
  });
});

describe("getTemplate", () => {
  it("should find taskpane template", () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
    };
    inputs["capabilities"] = ["taskpane"];

    const template = getTemplate(inputs);
    chai.expect(template).to.eq("taskpane");
  });
});

describe("helperMethods", async () => {
  describe("updateManifest", () => {
    const sandbox = sinon.createSandbox();
    const manifestPath = "manifestPath";
    const manifestTemplatePath = "manifestTemplatePath";
    let writePathResult: devPreview.DevPreviewSchema | undefined = undefined;

    beforeEach(() => {
      sandbox.stub(ManifestUtil, "loadFromPath").callsFake(async (path) => {
        if (path === manifestPath) {
          return {
            extensions: [],
            authorization: {
              permissions: {
                resourceSpecific: [],
              },
            },
          } as unknown as devPreview.DevPreviewSchema;
        } else if (path === manifestTemplatePath) {
          return {
            extensions: undefined,
            authorization: undefined,
          } as unknown as devPreview.DevPreviewSchema;
        }

        throw new Error("Invalid path");
      });

      sandbox.stub(ManifestUtil, "writeToPath").callsFake(async (path, manifest) => {
        writePathResult = manifest as devPreview.DevPreviewSchema;
        return;
      });

      sandbox.stub(manifestUtils, "getTeamsAppManifestPath").resolves(manifestTemplatePath);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should update manifest's extenstions and authorization", async () => {
      await HelperMethods.updateManifest("", manifestPath);

      chai.assert.isDefined(writePathResult);
      chai.assert.equal(writePathResult?.extensions?.length, 0);
      chai.assert.equal(writePathResult?.authorization?.permissions?.resourceSpecific?.length, 0);
    });
  });

  describe("downloadProjectTemplateZipFile", async () => {
    const sandbox = sinon.createSandbox();

    class ResponseData extends EventEmitter {
      pipe(ws: fs.WriteStream) {
        return this;
      }
    }

    class MockedWriteStream {
      on(event: string, cb: () => void) {
        return this;
      }
    }

    afterEach(() => {
      sandbox.restore();
    });

    it("should download project template zip file", async () => {
      const resp = new ResponseData();
      sandbox.stub(axios, "get").resolves({ data: resp });
      const mockedStream = new MockedWriteStream();
      const unzipStub = sandbox.stub(HelperMethods, "unzipProjectTemplate").resolves();
      sandbox.stub<any, any>(fs, "createWriteStream").returns(mockedStream);
      const promise = HelperMethods.downloadProjectTemplateZipFile("", "", "");
      // manully wait for the close event to be registered
      await new Promise((resolve) => setTimeout(resolve, 500));
      resp.emit("close");
      await promise;
      chai.expect(unzipStub.calledOnce).to.be.true;
    });
  });

  describe("unzipProjectTemplate", () => {
    const sandbox = sinon.createSandbox();

    class MockedReadStream {
      on(event: string, cb: () => void) {
        return this;
      }

      pipe(ws: fs.WriteStream) {
        return this;
      }
    }

    beforeEach(() => {
      sandbox.stub<any, any>(fs, "createReadStream").returns(new MockedReadStream());
      sandbox.stub<any, any>(unzip, "Extract").returns({});
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("work as expected", async () => {
      try {
        HelperMethods.unzipProjectTemplate("");
      } catch (err) {
        chai.assert.fail(err);
      }
    });
  });

  describe("moveUnzippedFiles", () => {
    const projectRoot = "/home/user/teamsapp";

    beforeEach(() => {
      mockfs({
        "/home/user/teamsapp/project.zip": "xxx",
        "/home/user/teamsapp/project": {
          file1: "xxx",
          file2: "yyy",
        },
      });
    });

    afterEach(() => {
      mockfs.restore();
    });

    it("should remove zip file and unzipped folder and copy files", async () => {
      try {
        HelperMethods.moveUnzippedFiles(projectRoot);
        chai.assert.equal(fs.existsSync("/home/user/teamsapp/project.zip"), false);
        chai.assert.equal(fs.existsSync("/home/user/teamsapp/project"), false);
        chai.assert.equal(fs.existsSync("/home/user/teamsapp/file1"), true);
        chai.assert.equal(fs.existsSync("/home/user/teamsapp/file2"), true);
      } catch (err) {
        chai.assert.fail(err);
      }
    });
  });

  describe("copyAddinFiles", () => {
    const projectRoot = "/home/user/teamsapp";

    beforeEach(() => {
      mockfs({
        "/home/user/teamsapp/.gitignore": "xxx",
        "/home/user/teamsapp/project": {
          file1: "xxx",
          file2: "yyy",
        },
        "/home/user/teamsapp/node_modules": {
          file3: "xxx",
        },
      });
    });

    afterEach(() => {
      mockfs.restore();
    });

    it("should copy project files and .gitignore but ignore node_modules", async () => {
      try {
        const destination = "/home/user/destination";
        HelperMethods.copyAddinFiles(projectRoot, destination);
        chai.assert.equal(fs.existsSync(path.join(destination, "project", "file1")), true);
        chai.assert.equal(fs.existsSync(path.join(destination, "project", "file2")), true);
        chai.assert.equal(fs.existsSync(path.join(destination, ".gitignore")), true);
        chai.assert.equal(fs.existsSync(path.join(destination, "node_modules")), false);
      } catch (err) {
        chai.assert.fail(err);
      }
    });
  });

  describe("moveManifestLocation", () => {
    const projectRoot = "/home/user/addin";

    beforeEach(() => {
      mockfs({
        "/home/user/addin/manifest.json": "{}",
        "/home/user/addin/assets": {
          file1: "xxx",
        },
        "/home/user/addin/webpack.config.js": JSON.stringify([
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "manifest*.json",
            to: "[name]" + "[ext]",
          },
        ]),
        "/home/user/addin/package.json": JSON.stringify({
          scripts: {
            start: "office-addin-debugging start manifest.json",
            stop: "office-addin-debugging stop manifest.json",
            validate: "office-addin-manifest validate manifest.json",
          },
        }),
        "/home/user/addin/src/taskpane/taskpane.html": `<img width="90" height="90" src="../../assets/logo-filled.png" alt="Contoso" title="Contoso" />`,
      });
    });

    afterEach(() => {
      mockfs.restore();
    });

    it("should move manifest.json into appPackage folder", async () => {
      await HelperMethods.moveManifestLocation(projectRoot, "manifest.json");
      chai.assert.isFalse(await fse.pathExists(path.join(projectRoot, "manifest.json")));
      chai.assert.isFalse(await fse.pathExists(path.join(projectRoot, "assets")));

      chai.assert.isTrue(
        await fse.pathExists(path.join(projectRoot, "appPackage", "manifest.json"))
      );
      chai.assert.isTrue(
        await fse.pathExists(path.join(projectRoot, "appPackage", "assets", "file1"))
      );

      const webpackConfigPath = path.join(projectRoot, "webpack.config.js");
      const webpackConfigJson = JSON.parse(await fse.readFile(webpackConfigPath, "utf8"));
      chai.assert.equal(webpackConfigJson[0].from, "appPackage/assets/*");
      chai.assert.equal(webpackConfigJson[1].from, "appPackage/manifest*.json");

      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(await fse.readFile(packageJsonPath, "utf8"));
      chai.assert.equal(
        packageJson.scripts.start,
        "office-addin-debugging start appPackage/manifest.json"
      );

      chai.assert.equal(
        packageJson.scripts.stop,
        "office-addin-debugging stop appPackage/manifest.json"
      );
      chai.assert.equal(
        packageJson.scripts.validate,
        "office-addin-manifest validate appPackage/manifest.json"
      );

      const htmlPath = path.join(projectRoot, "src", "taskpane", "taskpane.html");
      const html = await fse.readFile(htmlPath, "utf8");
      chai.assert.equal(
        html,
        `<img width="90" height="90" src="../../appPackage/assets/logo-filled.png" alt="Contoso" title="Contoso" />`
      );
    });
  });
});

describe("projectsJsonData", () => {
  it("should contain desired values", () => {
    const data = new projectsJsonData();
    chai.assert.equal(data.getHostDisplayName("outlook"), "Outlook");
    chai.assert.isUndefined(data.getHostDisplayName("xxx"));
    chai.assert.deepEqual(data.getHostTemplateNames("taskpane"), ["Outlook"]);
    chai.assert.isEmpty(data.getHostTemplateNames("xxx"));
    chai.assert.deepEqual(data.getSupportedScriptTypes("taskpane"), ["TypeScript"]);
    chai.assert.equal(
      data.getProjectTemplateRepository("taskpane", "typescript"),
      "https://github.com/OfficeDev/Office-Addin-TaskPane"
    );
    chai.assert.equal(
      data.getProjectTemplateBranchName("taskpane", "typescript", false),
      "json-preview-yo-office"
    );

    chai.assert.deepEqual(data.getProjectRepoAndBranch("taskpane", "TypeScript", false), {
      repo: "https://github.com/OfficeDev/Office-Addin-TaskPane",
      branch: "json-preview-yo-office",
    });

    chai.assert.isDefined(data.getParsedProjectJsonData());
    chai.assert.isFalse(data.projectBothScriptTypes("taskpane"));
  });
});
