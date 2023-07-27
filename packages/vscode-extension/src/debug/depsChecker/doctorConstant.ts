// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const InstallNode = "Go to https://nodejs.org/about/releases/ to install LTS Node.js.";
const InstallNodeV3 =
  "The supported node versions are specified in the package.json. Go to https://nodejs.org/about/releases/ to install a supported Node.js.";

export const doctorConstant = {
  Tick: "(√) Done:",
  TickWhiteSpace: "         ",
  Cross: "(×) Error:",
  Exclamation: "(!) Warning:",
  WhiteSpace: "   ",
  RestartVSCode:
    "Restart all your Visual Studio Code instances after the installation is finished.",
  NodeNotFound: `Cannot find Node.js. ${InstallNode}`,
  NodeNotSupported: (isV3Enabled: boolean) =>
    `Node.js (@CurrentVersion) is not the officially supported version (@SupportedVersions). Your project may continue to work but we recommend to install the supported version. ${
      isV3Enabled ? InstallNodeV3 : InstallNode
    }`,
  NodeSuccess: `Node.js version (@Version) is installed`,
  SignInSuccess: `Microsoft 365 Account (@account) is logged in and sideloading permission is enabled`,
  SignInSuccessWithNewAccount: `You are now using a different Microsoft 365 tenant. Microsoft 365 Account (@account) is logged in and sideloading permission is enabled`,
  Cert: "Development certificate for localhost",
  CertSuccess: "Development certificate for localhost is installed",
  NpmInstallSuccess: (displayName: string | undefined, cwd: string) =>
    displayName
      ? `npm packages for ${displayName} are installed`
      : `npm packages in directory ${cwd} are installed`,
  NpmInstallFailure: (displayName: string | undefined, cwd: string) =>
    displayName ? `npm packages for ${displayName}` : `npm packages in directory ${cwd}`,
  HelpLink: `Please refer to @Link for more information.`,
  Port: "Ports occupancy",
  PortSuccess: "Ports (@port) are not occupied",
  DepsSuccess: `@depsName is installed at @binFolder`,
};
