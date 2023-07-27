import { assert } from "chai";
import fs from "fs-extra";
import "mocha";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as sinon from "sinon";
import { jsonUtils } from "../../src/common/jsonUtils";
import { setTools } from "../../src/core/globalVars";
import { FileNotFoundError, JSONSyntaxError, UnhandledError } from "../../src/error/common";
import { MockTools } from "../core/utils";

describe("JSONUtils", () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = sinon.createSandbox();
  let mockedEnvRestore: RestoreFn | undefined;
  afterEach(() => {
    sandbox.restore();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  beforeEach(() => {
    mockedEnvRestore = mockedEnv({
      TEAMSFX_V3: "true",
    });
  });
  it("parseJSON success", async () => {
    const res = jsonUtils.parseJSON(`{"a":1}`);
    assert.isTrue(res.isOk());
  });
  it("parseJSON syntax error", async () => {
    const res = jsonUtils.parseJSON(`{"a":1,}`);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof JSONSyntaxError);
    }
  });
  it("parseJSON other error", async () => {
    sandbox.stub(JSON, "parse").throws(new Error("test error"));
    const res = jsonUtils.parseJSON(`{"a":1,}`);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UnhandledError);
    }
  });
  it("readJSONFile success", async () => {
    sandbox.stub(fs, "readJSON").resolves({ a: 1 });
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isOk());
  });
  it("readJSONFile syntax error", async () => {
    sandbox
      .stub(fs, "readJSON")
      .rejects(new SyntaxError("Unexpected token } in JSON at position 7"));
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof JSONSyntaxError);
    }
  });
  it("readJSONFile file not found", async () => {
    sandbox.stub(fs, "readJSON").rejects(new Error("no such file or directory"));
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof FileNotFoundError);
    }
  });
});
