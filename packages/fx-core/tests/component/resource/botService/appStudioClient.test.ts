// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Ivan Jobs <ruhe@microsoft.com>
 */
import { assert, expect } from "chai";
import "mocha";
import { createSandbox } from "sinon";
import { setTools } from "../../../../src/core/globalVars";
import { MockTools } from "../../../core/utils";
import { AppStudioClient } from "../../../../src/component/resource/botService/appStudio/appStudioClient";
import { IBotRegistration } from "../../../../src/component/resource/botService/appStudio/interfaces/IBotRegistration";
import { RetryHandler } from "../../../../src/component/resource/botService/retryHandler";
import axios from "axios";
import { ErrorNames } from "../../../../src/component/resource/botService/constants";
import { Messages } from "./messages";
import { AppStudioError } from "../../../../src/component/resource/appManifest/errors";
import { TelemetryUtils } from "../../../../src/component/resource/appManifest/utils/telemetry";
import { AppStudioClient as AppStudio } from "../../../../src/component/resource/appManifest/appStudioClient";

describe("AppStudio Client", () => {
  const tools = new MockTools();
  const sandbox = createSandbox();
  setTools(tools);
  const sampleBot: IBotRegistration = {
    botId: "0cd14903-d43a-47f5-b907-73c523aff076",
    name: "ruhe01290236-local-debug",
    description: "",
    iconUrl:
      "https://docs.botframework.com/static/devportal/client/images/bot-framework-default.png",
    messagingEndpoint: "https://8075-167-220-255-43.ngrok.io/api/messages",
    callingEndpoint: "",
  };

  describe("getBotRegistration", () => {
    afterEach(() => {
      sandbox.restore();
    });

    it("Should return a valid bot registration", async () => {
      // Arrange
      sandbox.stub(RetryHandler, "Retry").resolves({
        status: 200,
        data: sampleBot,
      });
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();
      // Act
      const res = await AppStudioClient.getBotRegistration("anything", "anything");

      // Assert
      assert.isTrue(res !== undefined);
      assert.isTrue(res?.botId === sampleBot.botId);
      expect(startStub.calledOnce).to.be.true;
      expect(successStub.calledOnce).to.be.true;
    });

    it("Should return a undefined when 404 was throwed out", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "get").rejects({
        response: {
          status: 404,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act
      const res = await AppStudioClient.getBotRegistration("anything", "anything");

      // Assert
      assert.isUndefined(res);
      expect(startStub.calledOnce).to.be.true;
      expect(successStub.calledOnce).to.be.false;
    });

    it("Should throw NotAllowedToAcquireToken error when 401 was throwed out", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "get").rejects({
        response: {
          status: 401,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.getBotRegistration("anything", "anything");
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.ACQUIRE_BOT_FRAMEWORK_TOKEN_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("Should throw DeveloperPortalAPIFailed error when other exceptions (500) were throwed out", async () => {
      // Arrange
      sandbox.stub(RetryHandler, "Retry").rejects({
        response: {
          headers: {
            "x-correlation-id": "anything",
          },
          status: 500,
        },
      });
      sandbox.stub(TelemetryUtils, "sendErrorEvent").returns();
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.getBotRegistration("anything", "anything");
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === AppStudioError.DeveloperPortalAPIFailedError.name);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });
  });

  describe("createBotRegistration", () => {
    afterEach(() => {
      sandbox.restore();
    });

    it("Bot registration should be created successfully", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").resolves({
        status: 200,
        data: sampleBot,
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.true;
      } catch (e) {
        assert.fail(Messages.ShouldNotReachHere);
      }
    });

    it("Bot registration creation should be skipped (existing bot case).", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(sampleBot);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.true;
      } catch (e) {
        assert.fail(Messages.ShouldNotReachHere);
      }
    });

    it("BotFrameworkNotAllowedToAcquireToken error should be throwed out (401)", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 401,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.ACQUIRE_BOT_FRAMEWORK_TOKEN_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("BotFrameworkForbiddenResult error should be throwed out (403)", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 403,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.FORBIDDEN_RESULT_BOT_FRAMEWORK_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("BotFrameworkConflictResult error should be throwed out (429)", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 429,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.CONFLICT_RESULT_BOT_FRAMEWORK_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("DeveloperPortalAPIFailed error should be throwed out (500)", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      sandbox.stub(RetryHandler, "Retry").rejects({
        response: {
          headers: {
            "x-correlation-id": "anything",
          },
          status: 500,
        },
      });
      sandbox.stub(TelemetryUtils, "sendErrorEvent").returns();
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.createBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === AppStudioError.DeveloperPortalAPIFailedError.name);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });
  });

  describe("updateBotRegistration", () => {
    afterEach(() => {
      sandbox.restore();
    });

    it("Bot registration should be updated successfully", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").resolves({
        status: 200,
        data: sampleBot,
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.updateBotRegistration("anything", sampleBot);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.true;
      } catch (e) {
        assert.fail(Messages.ShouldNotReachHere);
      }
    });

    it("BotFrameworkNotAllowedToAcquireToken error should be throwed out (401)", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 401,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.updateBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.ACQUIRE_BOT_FRAMEWORK_TOKEN_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("BotFrameworkForbiddenResult error should be throwed out (403)", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 403,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.updateBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.FORBIDDEN_RESULT_BOT_FRAMEWORK_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("BotFrameworkConflictResult error should be throwed out (429)", async () => {
      // Arrange
      const mockAxiosInstance = axios.create();
      sandbox.stub(mockAxiosInstance, "post").rejects({
        response: {
          status: 429,
        },
      });
      sandbox.stub(AppStudioClient, "newAxiosInstance").returns(mockAxiosInstance);
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.updateBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.CONFLICT_RESULT_BOT_FRAMEWORK_ERROR);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });

    it("DeveloperPortalAPIFailed error should be throwed out (500)", async () => {
      // Arrange
      sandbox.stub(RetryHandler, "Retry").rejects({
        response: {
          headers: {
            "x-correlation-id": "anything",
          },
          status: 500,
        },
      });
      sandbox.stub(TelemetryUtils, "sendErrorEvent").returns();
      const startStub = sandbox.stub(AppStudio, "sendStartEvent").returns();
      const successStub = sandbox.stub(AppStudio, "sendSuccessEvent").returns();

      // Act & Assert
      try {
        await AppStudioClient.updateBotRegistration("anything", sampleBot);
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === AppStudioError.DeveloperPortalAPIFailedError.name);
        expect(startStub.calledOnce).to.be.true;
        expect(successStub.calledOnce).to.be.false;
      }
    });
  });

  describe("updateMessageEndpoint", () => {
    afterEach(() => {
      sandbox.restore();
    });

    it("Message endpoint should be updated successfully", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(sampleBot);
      sandbox.stub(AppStudioClient, "updateBotRegistration").resolves();
      sandbox.stub(AppStudio, "sendStartEvent").returns();
      sandbox.stub(AppStudio, "sendSuccessEvent").returns();
      // Act & Assert
      try {
        await AppStudioClient.updateMessageEndpoint("anything", "anything", "anything");
      } catch (e) {
        assert.fail(Messages.ShouldNotReachHere);
      }
    });

    it("BotRegistrationNotFound error should be throwed out", async () => {
      // Arrange
      sandbox.stub(AppStudioClient, "getBotRegistration").resolves(undefined);
      // Act & Assert
      try {
        await AppStudioClient.updateMessageEndpoint("anything", "anything", "anything");
        assert.fail(Messages.ShouldNotReachHere);
      } catch (e) {
        assert.isTrue(e.name === ErrorNames.BOT_REGISTRATION_NOTFOUND_ERROR);
      }
    });
  });
});
