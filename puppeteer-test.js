import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Track API calls
  let apiCallCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/_serverdollar/Posts_fetchPostsServer")) {
      apiCallCount++;
      console.log("API call made:", request.url());
    }
  });

  // Capture console logs
  page.on("console", (msg) => {
    if (msg.text().includes("[Posts]")) {
      console.log("Browser console:", msg.text());
    }
  });

  await page.goto("http://localhost:3000/posts", { waitUntil: "networkidle2" });

  // Wait for the Next button to be visible
  await page.waitForSelector("button", { visible: true });

  // Find all buttons and click the one with text 'Next'
  const buttons = await page.$$("button");
  let nextButton = null;
  for (const button of buttons) {
    const text = await button.evaluate((el) => el.textContent);
    if (text?.trim() === "Next") {
      nextButton = button;
      break;
    }
  }

  if (!nextButton) {
    console.error("❌ Next button not found");
    await browser.close();
    process.exit(1);
  }

  const apiCallsBeforeClick = apiCallCount;
  console.log("API calls before click:", apiCallsBeforeClick);
  await nextButton.click();
  console.log("Clicked Next button");

  // Wait a bit for any network activity
  await new Promise((r) => setTimeout(r, 2000));

  const apiCallsAfterClick = apiCallCount;
  console.log("API calls after click:", apiCallsAfterClick);
  console.log(
    "Additional API calls made:",
    apiCallsAfterClick - apiCallsBeforeClick
  );

  if (apiCallsAfterClick > apiCallsBeforeClick) {
    console.log("✅ Pagination is working! Additional API call was made.");
  } else {
    console.log(
      "❌ No additional API call was made after clicking Next. Pagination may be broken."
    );
  }

  await browser.close();
})();
