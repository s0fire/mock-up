// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  SystemError,
  SystemErrorOptions,
  UserError,
  UserErrorOptions,
} from "@microsoft/teamsfx-api";
import { getDefaultString, getLocalizedString } from "../../common/localizeUtils";
import { DeployConstant } from "../constant/deployConstant";
import { HttpStatusCode } from "../constant/commonConstant";

/**
 * component error
 * store more information in FxError's innerError property for telemetry, logging and debugging
 *
 * @property name name of error, for classification
 * @property message always save error message in english
 * @property errorType which type of error will throw to fx-core
 * @property displayMessage the message show to user, always save as localized message
 * @property helpLink link to help page, mostly no use
 * @property detail detail error message, http response, console output, etc..
 */
export class BaseComponentInnerError extends Error {
  source: string;
  errorType: "UserError" | "SystemError";
  helpLink?: string;
  displayMessage?: string;
  suggestionKey?: string[];
  detail?: string;

  constructor(
    source: string,
    errorType: "UserError" | "SystemError",
    name: string,
    messageKey?: string,
    messageParams?: string[],
    suggestionKey?: string[],
    detail?: string,
    helpLink?: string
  ) {
    super(
      messageKey
        ? messageParams
          ? getDefaultString(messageKey, ...messageParams)
          : getDefaultString(messageKey)
        : ""
    );
    this.source = source;
    this.errorType = errorType;
    this.name = name;
    this.helpLink = helpLink;
    this.suggestionKey = suggestionKey;
    this.displayMessage = messageKey
      ? messageParams
        ? getLocalizedString(messageKey, ...messageParams)
        : getLocalizedString(messageKey)
      : "";
    this.detail = detail;
  }

  toFxError(): FxError {
    if (this.errorType === "UserError") {
      return new UserError({
        source: this.source,
        error: this,
        helpLink: this.helpLink,
        name: this.name,
        message: this.message,
        displayMessage: this.toDisplayMessage(),
      } as UserErrorOptions);
    } else {
      return new SystemError({
        source: this.source,
        name: this.name,
        message: this.message,
        error: this,
        helpLink: this.helpLink,
        displayMessage: this.toDisplayMessage(),
      } as SystemErrorOptions);
    }
  }

  /**
   * The suggestion message will be localized and add 'Suggestions:' by default
   * the final method will be like:
   *    'Error message. Suggestions: suggestion message'
   * can be overwritten by subclasses
   * @protected
   */
  protected toDisplayMessage(): string {
    const suggestion = this.suggestionKey?.map((key) => getLocalizedString(key)).join(" ");
    return this.displayMessage
      ? suggestion
        ? this.displayMessage + getLocalizedString("plugins.bot.ErrorSuggestions", suggestion)
        : this.displayMessage
      : this.message;
  }

  static unknownError(source: string, error: unknown): BaseComponentInnerError {
    return new BaseComponentInnerError(
      source,
      "SystemError",
      "UnknownError",
      "error.common.UnhandledError",
      [JSON.stringify(error)]
    );
  }
}

/**
 * component call external api error
 */
export class ExternalApiCallError extends BaseComponentInnerError {
  statusCode: number;

  constructor(
    source: string,
    name: string,
    message: string,
    statusCode: number,
    messageParams?: string[],
    suggestionKey?: string[],
    detail?: string,
    helpLink?: string
  ) {
    super(source, "UserError", name, message, messageParams, suggestionKey, detail, helpLink);
    this.statusCode = statusCode;
  }

  static getAzureCredentialError(source: string, error?: unknown): ExternalApiCallError {
    error = error ?? "";
    return new ExternalApiCallError(
      source,
      "GetAzureCredentialError",
      "plugins.bot.FailRetrieveAzureCredentials",
      -1,
      undefined,
      undefined,
      typeof error === "string" ? error : JSON.stringify(error)
    );
  }

  static getAzureCredentialRemoteError(source: string, error?: unknown): ExternalApiCallError {
    return new ExternalApiCallError(
      source,
      "GetAzureCredentialRemoteError",
      "driver.common.FailRetrieveAzureCredentialsRemoteError",
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      undefined,
      ["driver.common.suggestion.retryLater"],
      typeof error === "string" ? error : JSON.stringify(error)
    );
  }

  static getSasTokenError(source: string, detail?: string): ExternalApiCallError {
    return new ExternalApiCallError(
      source,
      "AzureStorageSASToeknEmpty",
      "error.frontend.GetContainerError",
      -1,
      [DeployConstant.AZURE_STORAGE_CONTAINER_NAME],
      [
        "plugins.frontend.checkSystemTimeTip",
        // eslint-disable-next-line no-secrets/no-secrets
        "plugins.frontend.checkStoragePermissionsTip",
        "plugins.frontend.checkNetworkTip",
      ],
      detail
    );
  }

  static getSasTokenRemoteError(source: string, detail?: string): ExternalApiCallError {
    return new ExternalApiCallError(
      source,
      "AzureStorageSASToeknEmpty",
      "driver.common.GetContainerRemoteError",
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      [DeployConstant.AZURE_STORAGE_CONTAINER_NAME],
      [
        "driver.common.suggestion.retryLater",
        "plugins.frontend.checkSystemTimeTip",
        // eslint-disable-next-line no-secrets/no-secrets
        "plugins.frontend.checkStoragePermissionsTip",
        "plugins.frontend.checkNetworkTip",
      ],
      detail
    );
  }
}

export class ExecuteCommandError extends BaseComponentInnerError {
  constructor(
    source: string,
    name: string,
    messageKey: string,
    messageParams: string[],
    error: string
  ) {
    super(
      source,
      "UserError",
      name,
      messageKey,
      messageParams,
      ["plugins.bot.CheckCommandOutput", "suggestions.retryTheCurrentStep"],
      error
    );
  }

  static fromErrorOutput(source: string, commands: string[], error: unknown): ExecuteCommandError {
    return new ExecuteCommandError(
      source,
      "CommandExecutionError",
      "plugins.bot.RunFailedCommand",
      commands,
      typeof error === "string" ? error : JSON.stringify(error)
    );
  }
}

/**
 * parameter in environmental error or user input error
 */
export class PrerequisiteError extends BaseComponentInnerError {
  constructor(
    source: string,
    name: string,
    messageKey: string,
    messageParams: string[] | undefined,
    suggestionKey?: string[],
    helpLink?: string
  ) {
    super(source, "UserError", name, messageKey, messageParams, suggestionKey, undefined, helpLink);
  }

  static somethingIllegal(
    source: string,
    name: string,
    messageKey: string,
    messageParams?: string[],
    helpLink?: string
  ): PrerequisiteError {
    return new PrerequisiteError(
      source,
      "Illegal" + PrerequisiteError.toCamel(name),
      messageKey,
      messageParams,
      undefined,
      helpLink
    );
  }

  static somethingMissing(source: string, name: string, helpLink?: string): PrerequisiteError {
    return new PrerequisiteError(
      source,
      PrerequisiteError.toCamel(name) + "IsMissing",
      "plugins.bot.SomethingIsMissing",
      [name],
      undefined,
      helpLink
    );
  }

  static folderNotExists(source: string, name: string, helpLink?: string): PrerequisiteError {
    return new PrerequisiteError(
      source,
      "FolderNotExists",
      "error.common.FileNotFoundError",
      [name],
      undefined,
      helpLink
    );
  }

  static toCamel(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}
