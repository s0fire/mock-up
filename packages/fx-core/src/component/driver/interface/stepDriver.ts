// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DriverContext } from "./commonArgs";
import { FxError, Result } from "@microsoft/teamsfx-api";

export type ExecutionResult = {
  result: Result<Map<string, string>, FxError>;
  // summaries hold the successful logs even if the result is a FxError.
  summaries: string[];
};

export interface StepDriver {
  readonly description?: string;

  /**
   * Run the driver.
   * @param args Arguments from the `with` section in the yaml file.
   * @param context logger, telemetry, progress bar, etc.
   */
  run(args: unknown, context: DriverContext): Promise<Result<Map<string, string>, FxError>>;

  /**
   * Run the driver and return success summary entries along with the result, no matter the result is success or failure.
   * Because a failed action may still emit some succuessful summaires.
   * The summary is expected to contain human readable information that will be presented to users.
   * @param args Arguments from the `with` section in the yaml file.
   * @param ctx logger, telemetry, progress bar, etc.
   * @param outputEnvVarNames the environment variable names for each output
   */
  execute?(
    args: unknown,
    ctx: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult>;
}
