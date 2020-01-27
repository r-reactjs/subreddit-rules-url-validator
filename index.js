// https://github.com/actions/hello-world-javascript-action/blob/master/index.js
const core = require('@actions/core');
const github = require('@actions/github');
const decode = require('unescape');
const cheerio = require('cheerio');
const urlExists = require('url-exists');
const util = require('util');
const allSettled = require('promise.allsettled');

const urlIsAvailable = util.promisify(urlExists);

// https://github.com/actions/toolkit/tree/master/packages/github#usage
async function run() {
  // This should be a token with access to your repository scoped in as a secret.
  // The YML workflow will need to set myToken with the GitHub Secret Token
  // githubToken: ${{ secrets.GITHUB_TOKEN }}
  // https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
  const githubToken = core.getInput('githubToken');
  const subreddit = core.getInput('subreddit');
  const repo = new github.GitHub(githubToken);

  const context = github.context;

  const newIssue = await repo.issues.create({
    ...context.repo,
    owner: 'r-reactjs',
    repo: 'subreddit-rules-url-validator',
    title: `New broken link(s) for "${subreddit}"!`,
    body: `Creating an issue for subreddit, "${subreddit}". Check this out, @dance2die!!!`
  });

  console.log(
    `newIssue`,
    JSON.stringify(newIssue, null, 2)
  );
}

run();
