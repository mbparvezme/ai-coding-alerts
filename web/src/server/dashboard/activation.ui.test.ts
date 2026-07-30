import { activationState } from "./activation";

test("pro users are active regardless of query", () => {
  expect(activationState("success", true)).toBe("active");
});
test("post-checkout not-yet-pro shows activating", () => {
  expect(activationState("success", false)).toBe("activating");
});
test("default is none", () => {
  expect(activationState(undefined, false)).toBe("none");
});
