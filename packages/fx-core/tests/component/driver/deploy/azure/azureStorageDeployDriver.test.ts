// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author xzf0587 <zhaofengxu@microsoft.com>
 */
import "mocha";
import * as sinon from "sinon";
import * as tools from "../../../../../src/common/tools";
import { AzureStorageDeployDriver } from "../../../../../src/component/driver/deploy/azure/azureStorageDeployDriver";
import { DeployArgs } from "../../../../../src/component/driver/interface/buildAndDeployArgs";
import { TestAzureAccountProvider } from "../../../util/azureAccountMock";
import { TestLogProvider } from "../../../util/logProviderMock";
import { assert } from "chai";
import {
  ListAccountSasResponse,
  StorageAccounts,
  StorageManagementClient,
} from "@azure/arm-storage";
import {
  BlobDeleteResponse,
  BlockBlobClient,
  BlockBlobParallelUploadOptions,
  ContainerClient,
} from "@azure/storage-blob";
import { MyTokenCredential } from "../../../../plugins/solution/util";
import * as armStorage from "@azure/arm-storage";
import { DriverContext } from "../../../../../src/component/driver/interface/commonArgs";
import { MockUserInteraction } from "../../../../core/utils";
import * as os from "os";
import * as uuid from "uuid";
import * as path from "path";
import * as fs from "fs-extra";
import * as chai from "chai";

function getMockStorageAccount1() {
  return {
    listAccountSAS: async function (): Promise<ListAccountSasResponse> {
      return {
        accountSasToken: "abc",
      };
    },
  };
}

describe("Azure Storage Deploy Driver test", () => {
  const sandbox = sinon.createSandbox();
  const sysTmp = os.tmpdir();
  const folder = uuid.v4();
  const testFolder = path.join(sysTmp, folder);

  before(async () => {
    await fs.mkdirs(testFolder);
  });

  after(async () => {
    fs.rmSync(testFolder, { recursive: true, force: true });
  });

  beforeEach(() => {
    sandbox.stub(tools, "waitSeconds").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("deploy to storage happy path", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").resolves(false);
    sandbox.stub(ContainerClient.prototype, "create").resolves();
    sandbox.stub(ContainerClient.prototype, "listBlobsFlat").returns([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //sandbox.stub(ContainerClient.prototype, "listBlobsFlat").resolves();
    sandbox
      .stub(ContainerClient.prototype, "deleteBlob")
      .resolves({ errorCode: undefined } as BlobDeleteResponse);
    /*const calls = sandbox.stub().callsFake(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    sandbox.stub(ContainerClient.prototype, "getBlockBlobClient").returns({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const res = await deploy.run(args, context);
    assert.equal(res.isOk(), true);
    const rex = await deploy.execute(args, context);
    assert.equal(rex.result.isOk(), true);
  });

  it("get azure account credential error", async () => {
    const deploy = new AzureStorageDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .throws(new Error("error"));

    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
  });

  it("clear storage error", async () => {
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    const deploy = new AzureStorageDeployDriver();
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;

    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").resolves(false);
    sandbox.stub(ContainerClient.prototype, "create").resolves();
    sandbox.stub(ContainerClient.prototype, "listBlobsFlat").returns([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //sandbox.stub(ContainerClient.prototype, "listBlobsFlat").resolves();
    sandbox
      .stub(ContainerClient.prototype, "deleteBlob")
      .resolves({ errorCode: "403" } as BlobDeleteResponse);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "ClearStorageError");
  });

  it("clear storage with remote server error", async () => {
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    const deploy = new AzureStorageDeployDriver();
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;

    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").resolves(false);
    sandbox.stub(ContainerClient.prototype, "create").resolves();
    sandbox.stub(ContainerClient.prototype, "listBlobsFlat").returns([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //sandbox.stub(ContainerClient.prototype, "listBlobsFlat").resolves();
    sandbox
      .stub(ContainerClient.prototype, "deleteBlob")
      .resolves({ errorCode: "error", _response: { status: 500 } } as BlobDeleteResponse);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "ClearStorageRemoteError");
  });

  it("upload with error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").resolves(false);
    sandbox.stub(ContainerClient.prototype, "create").resolves();
    sandbox.stub(ContainerClient.prototype, "listBlobsFlat").returns([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //sandbox.stub(ContainerClient.prototype, "listBlobsFlat").resolves();
    sandbox
      .stub(ContainerClient.prototype, "deleteBlob")
      .resolves({ errorCode: undefined } as BlobDeleteResponse);
    /*const calls = sandbox.stub().callsFake(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    sandbox.stub(ContainerClient.prototype, "getBlockBlobClient").returns({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return { errorCode: "error" };
      },
    } as BlockBlobClient);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "UploadToStorageError");
    const rex = await deploy.execute(args, context);
    assert.equal(rex.result.isErr(), true);
  });

  it("upload with remote server error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").resolves(false);
    sandbox.stub(ContainerClient.prototype, "create").resolves();
    sandbox.stub(ContainerClient.prototype, "listBlobsFlat").returns([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //sandbox.stub(ContainerClient.prototype, "listBlobsFlat").resolves();
    sandbox
      .stub(ContainerClient.prototype, "deleteBlob")
      .resolves({ errorCode: undefined } as BlobDeleteResponse);
    /*const calls = sandbox.stub().callsFake(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    sandbox.stub(ContainerClient.prototype, "getBlockBlobClient").returns({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return { errorCode: "error", _response: { status: 500 } };
      },
    } as BlockBlobClient);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "UploadToStorageRemoteError");
  });

  it("get container with remote server error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").throws({ statusCode: 500 });
    sandbox.stub(ContainerClient.prototype, "getBlockBlobClient").returns({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "GetStorageContainerRemoteError");
  });

  it("get container with normal error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      distributionPath: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new TestAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as DriverContext;
    sandbox
      .stub(context.azureAccountProvider, "getIdentityCredentialAsync")
      .resolves(new MyTokenCredential());
    const clientStub = sandbox.createStubInstance(StorageManagementClient);
    clientStub.storageAccounts = {} as StorageAccounts;
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    sandbox.stub(armStorage, "StorageManagementClient").returns(mockStorageManagementClient);
    sandbox.stub(ContainerClient.prototype, "exists").throws({ statusCode: 400 });
    sandbox.stub(ContainerClient.prototype, "getBlockBlobClient").returns({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const res = await deploy.run(args, context);
    assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "GetStorageContainerError");
  });
});
