// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import * as fs from "fs-extra";
import * as path from "path";

import {
  checkNpmDependencies,
  loadPackageJson,
  loadTeamsFxDevScript,
} from "../../../src/common/local/packageJsonHelper";

chai.use(chaiAsPromised);

describe("packageJsonHelper", () => {
  const testFolder = path.resolve(__dirname, "data");

  describe("loadPackageJson()", () => {
    beforeEach(() => {
      fs.ensureDirSync(testFolder);
      fs.emptyDirSync(testFolder);
    });

    it("happy path", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isDefined(packageJson);
      chai.assert.equal(packageJson!.name, "test");
      chai.assert.equal(packageJson!.version, "1.0.0");
      chai.assert.deepEqual(packageJson!.scripts, { build: "tsc --build" });
    });

    it("file not found", async () => {
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.remove(packageJsonPath);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isUndefined(packageJson);
    });

    it("bad format", async () => {
      const content = `\
        {\n\
          "name": "test",,,,\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isUndefined(packageJson);
    });
  });

  describe("loadTeamsFxDevScript()", () => {
    beforeEach(() => {
      fs.ensureDirSync(testFolder);
      fs.emptyDirSync(testFolder);
    });

    it("happy path", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev:teamsfx": "npm run dev",\n\
            "dev": "npx func start"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isDefined(devScript);
      chai.assert.equal(devScript, "npx func start");
    });

    it("file not found", async () => {
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.remove(packageJsonPath);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("bad format", async () => {
      const content = `\
        {\n\
          "name": "test",,,,\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("no scripts", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0"\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("no dev:teamsfx", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev": "npx func start -- Y"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("custom dev:teamsfx", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev:teamsfx": "npx func start --X",\n\
            "dev": "npx func start -- Y"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isDefined(devScript);
      chai.assert.equal(devScript, "npx func start --X");
    });
  });

  describe("checkNpmDependencies", () => {
    beforeEach(() => {
      fs.ensureDirSync(testFolder);
      fs.emptyDirSync(testFolder);
    });

    it("npm installed", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
            "my-package": "1.0.0"\n\
          }\n\
        }`;
      const packageLockJson = "package-lock.json place holder";
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);
      await fs.writeFile(path.join(testFolder, "package-lock.json"), packageLockJson);
      await fs.ensureDir(path.join(testFolder, "node_modules", "my-package"));

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isTrue(npmInstalled);
    });

    it("yarn installed", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
            "my-package": "1.0.0"\n\
          }\n\
        }`;
      const yarnLockJson = "yarn.lock place holder";
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);
      await fs.writeFile(path.join(testFolder, "yarn.lock"), yarnLockJson);
      await fs.ensureDir(path.join(testFolder, "node_modules", "my-package"));

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isTrue(npmInstalled);
    });

    it("installing", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
            "my-package1": "1.0.0",\n\
            "my-package2": "1.0.0"\n\
          }\n\
        }`;
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);
      await fs.ensureDir(path.join(testFolder, "node_modules", "my-package1"));

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isFalse(npmInstalled);
    });

    it("has dependencies but no node_modules", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
            "my-package": "1.0.0"\n\
          }\n\
        }`;
      const packageLockJson = "package-lock.json place holder";
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);
      await fs.writeFile(path.join(testFolder, "package-lock.json"), packageLockJson);

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isFalse(npmInstalled);
    });

    it("has dependencies but no package installed", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
            "my-package": "1.0.0"\n\
          }\n\
        }`;
      const packageLockJson = "package-lock.json place holder";
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);
      await fs.writeFile(path.join(testFolder, "package-lock.json"), packageLockJson);
      await fs.ensureDir(path.join(testFolder, "node_modules", ".staging"));

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isFalse(npmInstalled);
    });

    it("no dependencies npm installed", async () => {
      const packageJson = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          },\n\
          "dependencies": {\n\
          }\n\
        }`;
      await fs.writeFile(path.join(testFolder, "package.json"), packageJson);

      const npmInstalled = await checkNpmDependencies(testFolder);
      chai.assert.isTrue(npmInstalled);
    });
  });
});
