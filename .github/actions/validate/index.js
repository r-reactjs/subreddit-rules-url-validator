// https://github.com/actions/hello-world-javascript-action/blob/master/index.js
const core = require('@actions/core');
const github = require('@actions/github');

try {
  const subreddit = core.getInput('subreddit');
  console.log(`Hello ${subreddit}!`);
  // const time = (new Date()).toTimeString();
  // core.setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(
    github.context.payload,
    undefined,
    2
  );
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
