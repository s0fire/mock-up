import { UpdateAadAppOutput } from "../interface/updateAadAppOutput";
import * as fs from "fs-extra";
import * as path from "path";
import { AadManifestHelper } from "../../../resource/aadApp/utils/aadManifestHelper";
import { MissingFieldInManifestUserError } from "../error/invalidFieldInManifestError";
import isUUID from "validator/lib/isUUID";
import { getLocalizedString } from "../../../../common/localizeUtils";
import { logMessageKeys } from "../utility/constants";
import { DriverContext } from "../../interface/commonArgs";
import { AADManifest } from "../../../resource/aadApp/interfaces/AADManifest";
import { expandEnvironmentVariable, getEnvironmentVariables } from "../../../utils/common";
import { getUuid } from "../../../../common/tools";
import { UnresolvedPlaceholderError } from "../../../../error/common";

const actionName = "aadApp/update"; // DO NOT MODIFY the name
const helpLink = "https://aka.ms/teamsfx-actions/aadapp-update";
const driverConstants = {
  generateManifestFailedMessageKey: "driver.aadApp.error.generateManifestFailed",
};

export async function buildAadManifest(
  context: DriverContext,
  manifestPath: string,
  outputFilePath: string,
  state?: UpdateAadAppOutput
): Promise<AADManifest> {
  const manifestAbsolutePath = getAbsolutePath(manifestPath, context.projectPath);
  const manifest = await loadManifest(manifestAbsolutePath, state);
  const warningMessage = AadManifestHelper.validateManifest(manifest);
  if (warningMessage) {
    warningMessage.split("\n").forEach((warning) => {
      context.logProvider?.warning(warning);
    });
  }

  if (!manifest.id || !isUUID(manifest.id)) {
    throw new MissingFieldInManifestUserError(actionName, "id", helpLink);
  }

  // Output actual manifest to project folder first for better troubleshooting experience
  const outputFileAbsolutePath = getAbsolutePath(outputFilePath, context.projectPath);
  await fs.ensureDir(path.dirname(outputFileAbsolutePath));
  await fs.writeFile(outputFileAbsolutePath, JSON.stringify(manifest, null, 4), "utf8");
  context.logProvider?.info(
    getLocalizedString(logMessageKeys.outputAadAppManifest, outputFileAbsolutePath)
  );

  return manifest;
}

function getAbsolutePath(relativeOrAbsolutePath: string, projectPath: string) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(projectPath, relativeOrAbsolutePath);
}

async function loadManifest(
  manifestPath: string,
  state?: UpdateAadAppOutput
): Promise<AADManifest> {
  let generatedNewPermissionId = false;
  try {
    const manifestTemplate = await fs.readFile(manifestPath, "utf8");
    const permissionIdPlaceholderRegex = /\${{ *AAD_APP_ACCESS_AS_USER_PERMISSION_ID *}}/;

    // generate a new permission id if there's no one in env and manifest needs it
    if (!process.env.AAD_APP_ACCESS_AS_USER_PERMISSION_ID) {
      const matches = permissionIdPlaceholderRegex.exec(manifestTemplate);
      if (matches) {
        const permissionId = getUuid();
        process.env.AAD_APP_ACCESS_AS_USER_PERMISSION_ID = permissionId;
        if (state) {
          state.AAD_APP_ACCESS_AS_USER_PERMISSION_ID = permissionId;
        }
        generatedNewPermissionId = true;
      }
    }

    const manifestString = expandEnvironmentVariable(manifestTemplate);
    const unresolvedEnvironmentVariable = getEnvironmentVariables(manifestString);
    if (unresolvedEnvironmentVariable && unresolvedEnvironmentVariable.length > 0) {
      const error = new UnresolvedPlaceholderError(
        actionName,
        unresolvedEnvironmentVariable.join(", "),
        manifestPath,
        helpLink
      );
      throw error;
    }
    const manifest: AADManifest = JSON.parse(manifestString);
    AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
    return manifest;
  } finally {
    if (generatedNewPermissionId) {
      // restore environment variable to avoid impact to other code
      delete process.env.AAD_APP_ACCESS_AS_USER_PERMISSION_ID;
    }
  }
}
