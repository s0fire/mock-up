// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { HookContext, Middleware, NextFunction } from "@feathersjs/hooks";
import {
  ConcurrentError,
  ConfigFolderName,
  CoreCallbackEvent,
  err,
  Func,
  Inputs,
  ProductName,
} from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { lock, unlock } from "proper-lockfile";
import { TOOLS } from "../globalVars";
import { sendTelemetryErrorEvent } from "../../common/telemetry";
import { CallbackRegistry } from "../callback";
import { CoreSource, NoProjectOpenedError } from "../error";
import { shouldIgnored } from "./projectSettingsLoader";
import crypto from "crypto";
import * as os from "os";
import { waitSeconds } from "../../common/tools";
import { isValidProjectV2, isValidProjectV3 } from "../../common/projectSettingsHelper";
import { FileNotFoundError, InvalidProjectError } from "../../error/common";

let doingTask: string | undefined = undefined;
export const ConcurrentLockerMW: Middleware = async (ctx: HookContext, next: NextFunction) => {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  if (shouldIgnored(ctx)) {
    await next();
    return;
  }
  if (!inputs.projectPath) {
    ctx.result = err(new NoProjectOpenedError());
    return;
  }
  if (!(await fs.pathExists(inputs.projectPath))) {
    ctx.result = err(new FileNotFoundError("ConcurrentLockerMW", inputs.projectPath));
    return;
  }
  let configFolder = "";
  if (isValidProjectV3(inputs.projectPath)) {
    configFolder = path.join(inputs.projectPath);
  } else if (isValidProjectV2(inputs.projectPath)) {
    configFolder = path.join(inputs.projectPath, `.${ConfigFolderName}`);
  } else {
    ctx.result = err(new InvalidProjectError());
    return;
  }

  const lockFileDir = getLockFolder(inputs.projectPath);
  const lockfilePath = path.join(lockFileDir, `${ConfigFolderName}.lock`);
  await fs.ensureDir(lockFileDir);
  const taskName = `${ctx.method}${
    ctx.method === "executeUserTask" || ctx.method === "executeUserTaskOld"
      ? ` ${(ctx.arguments[0] as Func).method}`
      : ""
  }`;
  let acquired = false;
  let retryNum = 0;
  for (let i = 0; i < 10; ++i) {
    try {
      await lock(configFolder, { lockfilePath: lockfilePath });
      acquired = true;
      TOOLS?.logProvider.debug(
        `[core] success to acquire lock for task ${taskName} on: ${configFolder}`
      );
      for (const f of CallbackRegistry.get(CoreCallbackEvent.lock)) {
        f(taskName);
      }
      try {
        doingTask = taskName;
        if (retryNum > 0) {
          // failed for some try and finally success
          sendTelemetryErrorEvent(
            CoreSource,
            "concurrent-operation",
            new ConcurrentError(CoreSource),
            { retry: retryNum + "", acquired: "true", doing: doingTask, todo: taskName }
          );
        }
        await next();
      } finally {
        await unlock(configFolder, { lockfilePath: lockfilePath });
        for (const f of CallbackRegistry.get(CoreCallbackEvent.unlock)) {
          f(taskName);
        }
        TOOLS?.logProvider.debug(`[core] lock released on ${configFolder}`);
        doingTask = undefined;
      }
      break;
    } catch (e) {
      if (e["code"] === "ELOCKED") {
        await waitSeconds(1);
        ++retryNum;
        continue;
      }
      throw e;
    }
  }
  if (!acquired) {
    const log = `[core] failed to acquire lock for task ${taskName} on: ${configFolder}`;
    if (inputs.loglevel && inputs.loglevel === "Debug") {
      TOOLS?.logProvider?.debug(log);
    } else {
      TOOLS?.logProvider?.error(log);
    }
    // failed for 10 times and finally failed
    sendTelemetryErrorEvent(CoreSource, "concurrent-operation", new ConcurrentError(CoreSource), {
      retry: retryNum + "",
      acquired: "false",
      doing: doingTask || "",
      todo: taskName,
    });
    ctx.result = err(new ConcurrentError(CoreSource));
  }
};

export function getLockFolder(projectPath: string): string {
  return path.join(
    os.tmpdir(),
    `${ProductName}-${crypto.createHash("md5").update(projectPath).digest("hex")}`
  );
}
