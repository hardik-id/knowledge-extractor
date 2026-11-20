// @ts-check
// Playwright's list reporter says a test was skipped, not why. The live suite is mostly
// skipped on a machine without a model key or a saved sign-in, so print each reason.

export default class SkipReasons {
  /**
   * @param {import("@playwright/test/reporter").TestCase} test
   * @param {import("@playwright/test/reporter").TestResult} result
   */
  onTestEnd(test, result) {
    if (result.status !== "skipped") return;
    const reason = test.annotations.find((a) => a.type === "skip")?.description;
    console.log(`  skipped: ${test.title}\n    reason: ${reason ?? "(none given)"}`);
  }
}
