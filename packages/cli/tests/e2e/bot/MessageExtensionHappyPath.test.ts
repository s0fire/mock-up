// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { happyPathTest } from "./BotHappyPathCommon";
import { Runtime } from "../../commonlib/constants";
import { it } from "@microsoft/extra-shot-mocha";

describe("Provision message extension Node", () => {
  it("Provision Resource: message extension node", { testPlanCaseId: 15685647 }, async function () {
    await happyPathTest(Runtime.Node, "message-extension");
  });
});
