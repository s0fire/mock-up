import { UserError, UserErrorOptions } from "@microsoft/teamsfx-api";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import { globalVars } from "../core/globalVars";

/**
 * invalid yml schema, failed to parse yml file content into object
 */
export class InvalidYamlSchemaError extends UserError {
  constructor() {
    const key = "error.yaml.InvalidYamlSchemaError";
    const errorOptions: UserErrorOptions = {
      source: "ConfigManager",
      name: "InvalidYamlSchemaError",
      message: getDefaultString(key, globalVars.ymlFilePath),
      displayMessage: getLocalizedString(key, globalVars.ymlFilePath),
    };
    errorOptions.helpLink = "https://aka.ms/teamsfx-actions/invalid-lifecycle-error";
    super(errorOptions);
  }
}

/**
 * Yaml field has incorrect type
 */
export class YamlFieldTypeError extends UserError {
  constructor(field: string, type: string) {
    const key = "error.yaml.YamlFieldTypeError";
    const errorOptions: UserErrorOptions = {
      source: "ConfigManager",
      name: "YamlFieldTypeError",
      message: getDefaultString(key, field, type, globalVars.ymlFilePath),
      displayMessage: getLocalizedString(key, field, type, globalVars.ymlFilePath),
    };
    super(errorOptions);
  }
}

/**
 * Yaml field is missing
 */
export class YamlFieldMissingError extends UserError {
  constructor(field: string) {
    const key = "error.yaml.YamlFieldMissingError";
    const errorOptions: UserErrorOptions = {
      source: "ConfigManager",
      name: "YamlFieldMissingError",
      message: getDefaultString(key, field, globalVars.ymlFilePath),
      displayMessage: getLocalizedString(key, field, globalVars.ymlFilePath),
    };
    super(errorOptions);
  }
}

/**
 * Invalid yaml action name
 */
export class InvalidYmlActionNameError extends UserError {
  constructor(action: string) {
    const key = "error.yaml.InvalidYmlActionNameError";
    const errorOptions: UserErrorOptions = {
      source: "ConfigManager",
      name: "InvalidYmlActionNameError",
      message: getDefaultString(key, action, globalVars.ymlFilePath),
      displayMessage: getLocalizedString(key, action, globalVars.ymlFilePath),
      helpLink: "https://aka.ms/teamsfx-actions",
    };
    super(errorOptions);
  }
}

/**
 * Lifecycle not found
 */
export class LifeCycleUndefinedError extends UserError {
  constructor(lifecycle: string) {
    const key = "error.yaml.LifeCycleUndefinedError";
    const errorOptions: UserErrorOptions = {
      source: "Coordinator",
      name: "LifeCycleUndefinedError",
      message: getDefaultString(key, lifecycle, globalVars.ymlFilePath),
      displayMessage: getLocalizedString(key, lifecycle, globalVars.ymlFilePath),
      helpLink: "https://aka.ms/teamsfx-actions",
    };
    super(errorOptions);
  }
}
