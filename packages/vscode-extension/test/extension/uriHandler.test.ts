import * as chai from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { UriHandler } from "../../src/uriHandler";
import * as commonTools from "@microsoft/teamsfx-core/build/common/tools";

describe("uri handler", () => {
  const sandbox = sinon.createSandbox();
  beforeEach(() => {
    sandbox.restore();
  });
  afterEach(() => {
    sandbox.restore();
  });

  it("invalid uri missing query", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test");
    const showMessage = sandbox.stub(vscode.window, "showErrorMessage");
    await handler.handleUri(uri);

    sandbox.assert.calledOnce(showMessage);
  });

  it("invalid uri missing referer", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test?query=1");
    const showMessage = sandbox.stub(vscode.window, "showErrorMessage");
    await handler.handleUri(uri);

    sandbox.assert.calledOnce(showMessage);
  });

  it("invalid uri missing app id", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse("vscode://test.test?test=1&referrer=developerportal");
    sandbox.stub(commonTools, "isV3Enabled").returns(true);
    const showMessage = sandbox.stub(vscode.window, "showErrorMessage");
    await handler.handleUri(uri);

    sandbox.assert.calledOnce(showMessage);
  });

  it("error if not v3 enabled", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://test.test?appId=1&referrer=developerportal&login_hint=test"
    );
    sandbox.stub(commonTools, "isV3Enabled").returns(false);
    const showMessage = sandbox.stub(vscode.window, "showErrorMessage");
    await handler.handleUri(uri);

    chai.assert.isTrue(showMessage.calledOnce);
  });

  it("valid uri", async () => {
    const handler = new UriHandler();
    const uri = vscode.Uri.parse(
      "vscode://test.test?appId=1&referrer=developerportal&login_hint=test"
    );
    sandbox.stub(commonTools, "isV3Enabled").returns(true);

    const executeCommand = sandbox
      .stub(vscode.commands, "executeCommand")
      .returns(Promise.resolve(""));
    await handler.handleUri(uri);

    chai.assert.isTrue(executeCommand.calledOnce);
    sandbox.assert.calledOnceWithExactly(executeCommand, "fx-extension.openFromTdp", "1", "test");
  });

  it("valid code spaces callback uri", async () => {
    try {
      const handler = new UriHandler();
      const uri = vscode.Uri.parse(
        "vscode://TeamsDevApp.ms-teams-vscode-extension/auth-complete?code=abc"
      );
      await handler.handleUri(uri);
    } catch (e) {
      chai.assert.isTrue(false);
    }
  });
});
