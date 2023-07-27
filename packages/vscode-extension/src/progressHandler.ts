/* eslint-disable @typescript-eslint/no-this-alias */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { Mutex } from "async-mutex";
import * as util from "util";
import { ProgressLocation, window } from "vscode";

import { IProgressHandler, ok } from "@microsoft/teamsfx-api";

import { sleep } from "./utils/commonUtils";
import { localize } from "./utils/localizeUtils";

export class ProgressHandler implements IProgressHandler {
  private totalSteps: number;
  private currentStep: number;
  private title: string;
  private detail?: string;
  private ended: boolean;
  private mutex: Mutex;
  private view: string;

  private resolve?: any;

  constructor(title: string, totalSteps: number, view: "output" | "terminal" = "output") {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.title = title;
    this.ended = false;
    this.mutex = new Mutex();
    this.view = view;
  }

  private generateWholeMessage(): string {
    const head = this.title;
    const step = `[${this.currentStep}/${this.totalSteps}]`;
    let tail = "";
    if (this.view === "output") {
      tail = ` ${util.format(
        localize("teamstoolkit.progressHandler.showOutputLink"),
        "command:fx-extension.showOutputChannel"
      )}`;
    } else if (this.view === "terminal") {
      tail = ` ${util.format(
        localize("teamstoolkit.progressHandler.showTerminalLink"),
        "command:workbench.action.terminal.focus"
      )}`;
    }
    const detail = this.detail
      ? ` ${this.detail}`
      : localize("teamstoolkit.progressHandler.prepareTask");

    return util.format(
      localize("teamstoolkit.progressHandler.reloadNotice"),
      `${head}: ${step}`,
      detail,
      tail
    );
  }

  public async start(detail?: string) {
    this.resolve = undefined;
    this.currentStep = 0;
    this.ended = false;

    this.detail = detail;
    const _this = this;
    const promise = new Promise((resolve) => {
      _this.resolve = resolve;
    });

    window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: false,
      },
      async (progress) => {
        await sleep(10);
        let resolve = _this.resolve;
        do {
          const status = { message: this.generateWholeMessage() };
          progress.report(status);
          await sleep(10);
          resolve = await new Promise((_resolve) => resolve?.(_resolve));
        } while (!this.ended);
        return ok(null);
      }
    );

    this.resolve = await promise;
  }

  public async end(success: boolean) {
    this.ended = true;
    this.resolve?.(undefined);
    await sleep(10);
  }

  public async next(detail?: string) {
    await this.mutex.runExclusive(async () => {
      this.detail = detail;
      this.currentStep++;
      this.totalSteps = Math.max(this.currentStep, this.totalSteps);
      this.resolve = await new Promise((resolve) => this.resolve?.(resolve));
    });
  }
}
