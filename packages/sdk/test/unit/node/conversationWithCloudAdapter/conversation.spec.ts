// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CloudAdapter, TurnContext, Request, Response } from "botbuilder";
import { assert, use as chaiUse } from "chai";
import * as chaiPromises from "chai-as-promised";
import mockedEnv from "mocked-env";
import * as sinon from "sinon";
import { ConversationBot } from "../../../../src/conversationWithCloudAdapter/conversation";

chaiUse(chaiPromises);

describe("ConversationBot Tests - Node", () => {
  const clientId = "fake_client_id";
  const clientSecret = "fake_client_secret";
  const tenantId = "fake_tenant";
  const authorityHost = "fake_authority_host";
  const initiateLoginEndpoint = "fake_initiate_login_endpoint";
  let mockedEnvRestore: () => void;

  const sandbox = sinon.createSandbox();

  beforeEach(() => {
    mockedEnvRestore = mockedEnv({
      INITIATE_LOGIN_ENDPOINT: initiateLoginEndpoint,
      M365_CLIENT_ID: clientId,
      M365_CLIENT_SECRET: clientSecret,
      M365_TENANT_ID: tenantId,
      M365_AUTHORITY_HOST: authorityHost,
    });
  });

  afterEach(() => {
    mockedEnvRestore();
    sandbox.restore();
  });

  it("Create with default options", () => {
    const conversationBot = new ConversationBot({});
    assert.isDefined(conversationBot.adapter);
    assert.isDefined(conversationBot.adapter.onTurnError);
    assert.isUndefined(conversationBot.command);
    assert.isUndefined(conversationBot.notification);
    assert.isUndefined(conversationBot.cardAction);
  });

  it("Create with customized adapter", () => {
    const adapter = sandbox.createStubInstance(CloudAdapter);
    const conversationBot = new ConversationBot({ adapter: adapter });
    assert.isDefined(conversationBot.adapter);
    assert.equal(conversationBot.adapter, adapter);
    assert.isUndefined(conversationBot.command);
    assert.isUndefined(conversationBot.notification);
    assert.isUndefined(conversationBot.cardAction);
  });

  it("Create with customized adapterConfig", () => {
    const conversationBot = new ConversationBot({ adapterConfig: { foo: "bar" } });
    assert.isDefined(conversationBot.adapter);
    assert.isDefined(conversationBot.adapter.onTurnError);
    assert.isUndefined(conversationBot.command);
    assert.isUndefined(conversationBot.notification);
    assert.isUndefined(conversationBot.cardAction);
  });

  it("Create with all enabled", () => {
    const conversationBot = new ConversationBot({
      command: { enabled: true },
      notification: { enabled: true },
      cardAction: { enabled: true },
    });
    assert.isDefined(conversationBot.adapter);
    assert.isDefined(conversationBot.adapter.onTurnError);
    assert.isDefined(conversationBot.command);
    assert.isDefined(conversationBot.notification);
    assert.isDefined(conversationBot.cardAction);
  });

  it("requestHandler correctly handles empty logic", async () => {
    const adapter = sandbox.createStubInstance(CloudAdapter);
    const context = sandbox.createStubInstance(TurnContext);
    let called = false;
    (
      adapter.process as unknown as sinon.SinonStub<
        [
          req: Request<Record<string, unknown>, Record<string, string | string[] | undefined>>,
          res: Response,
          logic: (context: TurnContext) => Promise<any>
        ],
        Promise<void>
      >
    ).callsFake(async (req, res, logic) => {
      await logic(context);
      called = true;
    });

    const conversationBot = new ConversationBot({ adapter: adapter });
    await conversationBot.requestHandler({} as any, {} as any);
    assert.isTrue(called);
  });

  it("requestHandler correctly handles non-empty logic", async () => {
    const adapter = sandbox.createStubInstance(CloudAdapter);
    const context = sandbox.createStubInstance(TurnContext);

    (
      adapter.process as unknown as sinon.SinonStub<
        [
          req: Request<Record<string, unknown>, Record<string, string | string[] | undefined>>,
          res: Response,
          logic: (context: TurnContext) => Promise<any>
        ],
        Promise<void>
      >
    ).callsFake(async (req, res, logic) => {
      await logic(context);
    });

    let called = false;
    const conversationBot = new ConversationBot({ adapter: adapter });
    await conversationBot.requestHandler({} as any, {} as any, async (ctx) => {
      called = true;
    });
    assert.isTrue(called);
  });
});
