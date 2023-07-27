// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as versionUtil from "./versionUtil";
import { SyncedState, UserState } from "../constants";
import * as util from "util";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent } from "../telemetry/extTelemetryEvents";
import * as folder from "../folder";
import { localize } from "./localizeUtils";
import { isV3Enabled } from "@microsoft/teamsfx-core";

export class ExtensionUpgrade {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async showChangeLog() {
    const extensionId = versionUtil.getExtensionId();
    const teamsToolkit = vscode.extensions.getExtension(extensionId);
    const teamsToolkitVersion = teamsToolkit?.packageJSON.version;
    const syncedVersion = this.context.globalState.get<string>(SyncedState.Version);

    if (
      !isV3Enabled() &&
      (syncedVersion === undefined || versionUtil.compare(teamsToolkitVersion, syncedVersion) === 1)
    ) {
      // if syncedVersion is undefined, then it is not existinig user
      this.context.globalState.update(
        UserState.IsExisting,
        syncedVersion === undefined ? "no" : "yes"
      );
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowWhatIsNewNotification);
      this.context.globalState.update(SyncedState.Version, teamsToolkitVersion);

      const whatIsNew = {
        title: localize("teamstoolkit.upgrade.whatIsNewTitle"),
        run: async (): Promise<void> => {
          const uri = vscode.Uri.file(`${folder.getResourceFolder()}/WHATISNEW.md`);
          vscode.workspace.openTextDocument(uri).then(() => {
            const PreviewMarkdownCommand = "markdown.showPreview";
            vscode.commands.executeCommand(PreviewMarkdownCommand, uri);
          });
        },
      };

      vscode.window
        .showInformationMessage(
          util.format(localize("teamstoolkit.upgrade.banner"), teamsToolkitVersion),
          whatIsNew
        )
        .then((selection) => {
          if (selection?.title === localize("teamstoolkit.upgrade.whatIsNewTitle")) {
            ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowWhatIsNewContext);
            selection.run();
          }
        });
    }
  }
}
