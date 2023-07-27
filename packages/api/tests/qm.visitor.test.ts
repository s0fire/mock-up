// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Colors,
  err,
  FuncQuestion,
  FxError,
  Inputs,
  InputTextConfig,
  InputTextResult,
  IProgressHandler,
  MultiSelectConfig,
  MultiSelectQuestion,
  MultiSelectResult,
  ok,
  OptionItem,
  Platform,
  QTreeNode,
  Result,
  RunnableTask,
  SelectFileConfig,
  SelectFileResult,
  SelectFilesConfig,
  SelectFilesResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleSelectConfig,
  SingleSelectQuestion,
  SingleSelectResult,
  StaticOptions,
  TaskConfig,
  TextInputQuestion,
  StringValidation,
  traverse,
  UserCancelError,
  UserInteraction,
} from "../src/index";
import "mocha";
import { assert } from "chai";
import sinon from "sinon";

function createInputs(): Inputs {
  return {
    platform: Platform.VSCode,
  };
}

function createTextQuestion(name: string): TextInputQuestion {
  return {
    type: "text",
    name: name,
    title: name,
  };
}

function createSingleSelectQuestion(name: string): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: name,
    title: name,
    staticOptions: [],
  };
}

function createMultiSelectQuestion(name: string): MultiSelectQuestion {
  return {
    type: "multiSelect",
    name: name,
    title: name,
    staticOptions: [],
  };
}

function createFuncQuestion(name: string): FuncQuestion {
  return {
    type: "func",
    name: name,
    func: async (inputs: Inputs): Promise<string> => {
      return `mocked value of ${name}`;
    },
  };
}

class MockUserInteraction implements UserInteraction {
  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    throw new Error("Method not implemented.");
  }

  openUrl(link: string): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }
  async showMessage(
    level: "info" | "warn" | "error",
    message: string,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
    level: "info" | "warn" | "error",
    message: Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
    level: "info" | "warn" | "error",
    message: string | Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>> {
    throw new Error("Method not implemented.");
  }
  createProgressBar(title: string, totalSteps: number): IProgressHandler {
    throw new Error("Method not implemented.");
  }
  runWithProgress<T>(
    task: RunnableTask<T>,
    config: TaskConfig,
    ...args: any
  ): Promise<Result<T, FxError>> {
    throw new Error("Method not implemented.");
  }
}

const mockUI = new MockUserInteraction();
const sandbox = sinon.createSandbox();

describe("Question Model - Visitor Test", () => {
  describe("question", () => {
    it("trim() case 1", async () => {
      const node1 = new QTreeNode({ type: "group" });
      const node2 = new QTreeNode({ type: "group" });
      const node3 = new QTreeNode({ type: "group" });
      node1.addChild(node2);
      node1.addChild(node3);
      const trimed = node1.trim();
      assert.isTrue(trimed === undefined);
    });

    it("trim() case 2", async () => {
      const node1 = new QTreeNode({ type: "group" });
      const node2 = new QTreeNode({ type: "group" });
      const node3 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      node3.condition = { equals: "1" };
      node1.addChild(node2);
      node2.addChild(node3);
      const trimed = node1.trim();
      assert.isTrue(trimed && trimed.data.name === "t1" && trimed.validate());
    });

    it("trim() case 3 - parent node has condition, and child node has no condition.", async () => {
      const condition: StringValidation = {
        equals: "test",
      };

      // Arrange
      // input
      const node1 = new QTreeNode({ type: "group" });
      node1.condition = condition;
      const node2 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      node1.addChild(node2);

      // expected
      const expected1 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      expected1.condition = condition;

      // Act
      const trimmed = node1.trim();

      // Assert
      assert.deepEqual(trimmed, expected1);
    });
    it("trim() case 4 - parent node has no condition, and child node has condition.", async () => {
      const condition: StringValidation = {
        equals: "test",
      };

      // Arrange
      // input
      const node1 = new QTreeNode({ type: "group" });
      const node2 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      node2.condition = condition;
      node1.addChild(node2);

      // expected
      const expected1 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      expected1.condition = condition;

      // Act
      const trimmed = node1.trim();

      // Assert
      assert.deepEqual(trimmed, expected1);
    });
    it("trim() case 5 - parent node has condition, and child node has condition.", async () => {
      const condition: StringValidation = {
        equals: "test",
      };

      // Arrange
      // input
      const node1 = new QTreeNode({ type: "group" });
      node1.condition = condition;
      const node2 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      node2.condition = condition;
      node1.addChild(node2);

      // expected
      const expected1 = new QTreeNode({ type: "group" });
      expected1.condition = condition;
      const expected2 = new QTreeNode({ type: "text", name: "t1", title: "t1" });
      expected2.condition = condition;
      expected1.addChild(expected2);

      // Act
      const trimmed = node1.trim();

      // Assert
      assert.deepEqual(trimmed, expected1);
    });
  });
  describe("traverse()", () => {
    beforeEach(() => {});

    afterEach(() => {
      sandbox.restore();
    });

    it("fail: user cancel", async () => {
      const num = 10;
      const cancelNum = 5;
      const actualSequence: string[] = [];
      sandbox.stub(mockUI, "inputText").callsFake(async (config: InputTextConfig) => {
        const actualStep = Number(config.name);
        if (actualStep === cancelNum) {
          return err(UserCancelError);
        }
        actualSequence.push(config.name);
        assert(config.step === actualStep);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root = new QTreeNode({ type: "group" });

      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        root.addChild(new QTreeNode(createTextQuestion(`${i}`)));
        if (i < cancelNum) expectedSequence.push(`${i}`);
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isErr() && res.error === UserCancelError);
      for (let i = 1; i < cancelNum; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: flat sequence", async () => {
      const actualSequence: string[] = [];
      sandbox.stub(mockUI, "inputText").callsFake(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        const actualStep = Number(config.name);
        assert(config.step === actualStep);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root = new QTreeNode({ type: "group" });
      const num = 10;
      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        root.addChild(new QTreeNode(createTextQuestion(`${i}`)));
        expectedSequence.push(`${i}`);
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= num; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: auto skip single option select", async () => {
      const actualSequence: string[] = [];
      sandbox.stub(mockUI, "selectOption").callsFake(async (config: SingleSelectConfig) => {
        actualSequence.push(config.name);
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });
      const root = new QTreeNode({ type: "group" });
      const num = 10;
      const expectedSequence: string[] = [];
      for (let i = 1; i <= num; ++i) {
        const name = `${i}`;
        const question = createSingleSelectQuestion(name);
        if (i % 2 === 0) question.staticOptions = [`mocked value of ${name}`];
        else {
          question.staticOptions = [`mocked value of ${name}`, `mocked value of ${name} - 2`];
          expectedSequence.push(name);
        }
        question.skipSingleOption = true;
        const current = new QTreeNode(question);
        root.addChild(current);
      }
      const inputs = createInputs();
      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= num; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: flat sequence with back operation", async () => {
      const actualSequence: string[] = [];
      const set = new Set<string>();
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            assert.isTrue(inputs[config.name] === undefined);
            let result: Result<SingleSelectResult, FxError>;
            if (config.name === "1") {
              result = ok({ type: "success", result: `mocked value of ${config.name}` });
            } else {
              if (set.has(config.name)) {
                result = ok({ type: "success", result: `mocked value of ${config.name}` });
              } else {
                result = ok({ type: "back" });
              }
            }
            set.add(config.name);
            return result;
          }
        );
      const root = new QTreeNode({ type: "group" });
      const expectedSequence: string[] = ["1", "3", "1", "3", "5", "3", "5", "6", "5", "6"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [`mocked value of 1`, `mocked value of 1 - 2`];
      root.addChild(new QTreeNode(question1));

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [`mocked value of 2`];
      question2.skipSingleOption = true;
      root.addChild(new QTreeNode(question2));

      const question3 = createSingleSelectQuestion("3");
      question3.staticOptions = [`mocked value of 3`, `mocked value of 3 - 2`];
      root.addChild(new QTreeNode(question3));

      const question4 = createFuncQuestion("4");
      root.addChild(new QTreeNode(question4));

      const question5 = createSingleSelectQuestion("5");
      question5.staticOptions = [`mocked value of 5`, `mocked value of 5 - 2`];
      root.addChild(new QTreeNode(question5));

      const question6 = createSingleSelectQuestion("6");
      question6.staticOptions = [`mocked value of 6`, `mocked value of 6 - 2`];
      root.addChild(new QTreeNode(question6));

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= 6; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("fail: go back from start and cancel", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            assert.isTrue(inputs[config.name] === undefined);
            return ok({ type: "back" });
          }
        );
      const root = new QTreeNode({ type: "group" });
      const expectedSequence: string[] = ["3"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [`mocked value of 1`];
      question1.skipSingleOption = true;
      root.addChild(new QTreeNode(question1));

      const question2 = createFuncQuestion("2");
      root.addChild(new QTreeNode(question2));

      const question3 = createSingleSelectQuestion("3");
      question3.staticOptions = [`mocked value of 3`, `mocked value of 3 - 2`];
      root.addChild(new QTreeNode(question3));

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isErr() && res.error === UserCancelError);
      for (let i = 1; i <= 3; ++i) {
        assert.isTrue(inputs[`${i}`] === undefined);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: SingleSelectQuestion, MultiSelectQuestion", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: config.options[0] });
          }
        );
      sandbox
        .stub(mockUI, "selectOptions")
        .callsFake(
          async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: [config.options[0] as OptionItem] });
          }
        );
      const root = new QTreeNode({ type: "group" });
      const expectedSequence: string[] = ["1", "4"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [{ id: `mocked value of 1`, label: `mocked value of 1` }];
      question1.returnObject = true;
      root.addChild(new QTreeNode(question1));

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      root.addChild(new QTreeNode(question2));

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      question3.returnObject = true;
      root.addChild(new QTreeNode(question3));

      const question4 = createMultiSelectQuestion("4");
      question4.staticOptions = [{ id: `mocked value of 4`, label: `mocked value of 4` }];
      root.addChild(new QTreeNode(question4));

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.deepEqual(inputs["1"], { id: `mocked value of 1`, label: `mocked value of 1` });
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.isTrue(inputs["3"] instanceof Array);
      assert.isTrue(inputs["4"] instanceof Array);
      assert.deepEqual((inputs["3"] as StaticOptions)[0], {
        id: `mocked value of 3`,
        label: `mocked value of 3`,
      });
      assert.deepEqual((inputs["4"] as StaticOptions)[0], {
        id: `mocked value of 4`,
        label: `mocked value of 4`,
      });
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: node condition", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: config.options[0] as OptionItem });
          }
        );
      sandbox
        .stub(mockUI, "selectOptions")
        .callsFake(
          async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: [config.options[0] as OptionItem] });
          }
        );

      const expectedSequence: string[] = ["1"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = ["2", "3"];
      question1.returnObject = true;
      const node1 = new QTreeNode(question1);

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      const node2 = new QTreeNode(question2);
      node2.condition = { equals: "2" };
      node1.addChild(node2);

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      const node3 = new QTreeNode(question3);
      node3.condition = { equals: "3" };
      node1.addChild(node3);

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["1"] === `2`);
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("success: node condition on OptionItem", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: config.options[0] as OptionItem });
          }
        );
      sandbox
        .stub(mockUI, "selectOptions")
        .callsFake(
          async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: [config.options[0] as OptionItem] });
          }
        );

      const expectedSequence: string[] = ["1"];

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [
        { id: "2", label: "2" },
        { id: "3", label: "3" },
      ];
      question1.returnObject = true;
      const node1 = new QTreeNode(question1);

      const question2 = createSingleSelectQuestion("2");
      question2.staticOptions = [{ id: `mocked value of 2`, label: `mocked value of 2` }];
      question2.skipSingleOption = true;
      const node2 = new QTreeNode(question2);
      node2.condition = { equals: "2" };
      node1.addChild(node2);

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [{ id: `mocked value of 3`, label: `mocked value of 3` }];
      question3.skipSingleOption = true;
      const node3 = new QTreeNode(question3);
      node3.condition = { equals: "3" };
      node1.addChild(node3);

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.isTrue(inputs["1"].id === "2");
      assert.isTrue(typeof inputs["2"] === "string" && inputs["2"] === `mocked value of 2`);
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });

    it("pre-defined question will not be count as one step", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      sandbox
        .stub(mockUI, "selectOption")
        .callsFake(
          async (config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: config.options[0] });
          }
        );
      const multiSelect = sandbox
        .stub(mockUI, "selectOptions")
        .callsFake(
          async (config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> => {
            actualSequence.push(config.name);
            return ok({ type: "success", result: [config.options[0] as OptionItem] });
          }
        );

      const root = new QTreeNode({ type: "group" });

      const question1 = createSingleSelectQuestion("1");
      question1.staticOptions = [
        { id: `mocked value of 1`, label: `mocked value of 1` },
        { id: `mocked value of 2`, label: `mocked value of 2` },
      ];
      question1.returnObject = true;
      root.addChild(new QTreeNode(question1));
      inputs["1"] = { id: `mocked value of 1`, label: `mocked value of 1` };

      const question3 = createMultiSelectQuestion("3");
      question3.staticOptions = [
        { id: `mocked value of 3`, label: `mocked value of 3` },
        { id: `mocked value of 4`, label: `mocked value of 4` },
      ];
      question3.skipSingleOption = true;
      question3.returnObject = true;
      root.addChild(new QTreeNode(question3));

      const res = await traverse(root, inputs, mockUI);
      assert.isTrue(res.isOk());
      assert.equal((multiSelect.lastCall.args[0] as MultiSelectConfig).step, 1);
    });

    it("success: complex go back", async () => {
      const actualSequence: string[] = [];
      const inputs = createInputs();
      let skiped = false;
      sandbox.stub(mockUI, "inputText").callsFake(async (config: InputTextConfig) => {
        actualSequence.push(config.name);
        if (config.name === "3" && !skiped) {
          skiped = true;
          return ok({ type: "back" });
        }
        return ok({ type: "success", result: `mocked value of ${config.name}` });
      });

      const expectedSequence: string[] = ["1", "2", "3", "2", "3", "4"];

      const question1 = createTextQuestion("1");
      const node1 = new QTreeNode(question1);

      const question2 = createTextQuestion("2");
      const node2 = new QTreeNode(question2);
      node1.addChild(node2);

      const question3 = createTextQuestion("3");
      const node3 = new QTreeNode(question3);
      node2.addChild(node3);

      const question4 = createTextQuestion("4");
      const node4 = new QTreeNode(question4);
      node2.addChild(node4);

      const res = await traverse(node1, inputs, mockUI);
      assert.isTrue(res.isOk());
      for (let i = 1; i <= 4; ++i) {
        assert.isTrue(inputs[`${i}`] === `mocked value of ${i}`);
      }
      assert.sameOrderedMembers(expectedSequence, actualSequence);
    });
  });
});
