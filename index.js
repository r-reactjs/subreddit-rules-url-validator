// https://github.com/actions/hello-world-javascript-action/blob/master/index.js
const core = require('@actions/core')
const github = require('@actions/github')
const decode = require('unescape')
const cheerio = require('cheerio')
// const urlExists = require('url-exists')
// const util = require('util')
const allSettled = require('promise.allsettled')

async function urlExists(url, cb) {
  try {
    const response = await fetch({ url: url, method: 'HEAD' })
    return /4\d\d/.test(response.status) === false
  } catch (error) {
    return false
  }
}

// const urlIsAvailable = util.promisify(urlExists)
const urlIsAvailable = urlExists

// This should be a token with access to your repository scoped in as a secret.
// The YML workflow will need to set myToken with the GitHub Secret Token
// githubToken: ${{ secrets.GITHUB_TOKEN }}
// https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#about-the-github_token-secret
const githubToken = core.getInput('githubToken')
const subreddit = core.getInput('subreddit')
const octokit = new github.GitHub(githubToken)
const context = github.context
const owner = 'r-reactjs'
const repo = 'subreddit-rules-url-validator'

const urlMap = {
  rules: {
    url: `https://api.reddit.com/${subreddit}/about/rules`
  },
  sidebar: {
    url: `https://api.reddit.com/${subreddit}/about.json`
  }
}

const extractUrlList = html => {
  const $ = cheerio.load(html)
  // https://stackoverflow.com/a/27981856/4035
  return (
    $('a')
      .map(function() {
        return $(this).attr('href')
      })
      // Return URL as string
      .get()
      // Get valid URLs only
      .filter(href => /http(s)?:\/\//i.test(href))
  )
}

const validateRulesUrlList = async ({ short_name, description_html }) => {
  const html = decode(description_html)
  const urlList = extractUrlList(html)

  const checkPromises = urlList.map(
    async url =>
      await urlIsAvailable(url).then(exist => ({
        exist,
        url
      }))
  )

  const checkedResults = await allSettled(checkPromises)
  return { rule: short_name, checkedResults }
}

const getRulesUrlList = async url => {
  try {
    const response = await fetch(url)
    const { rules } = await response.json()

    const brokenPromises = rules
      .filter(rule => {
        const html = decode(rule.description_html)
        const urlList = extractUrlList(html)
        return urlList.length > 0
      })
      .map(async rule => await validateRulesUrlList(rule))

    return await allSettled(brokenPromises)
  } catch (error) {
    Promise.reject(error)
  }
}

const getSidebarUrlList = async url => {
  try {
    const {
      data: { description_html }
    } = await fetch(url).then(_ => _.json())
    const html = decode(description_html)
    const urlList = extractUrlList(html)
    const checkPromises = urlList.map(
      async url =>
        await urlIsAvailable(url).then(exist => ({
          exist,
          url
        }))
    )

    return await allSettled(checkPromises)
  } catch (error) {
    Promise.reject(error)
  }
}

/*
  // https://codesandbox.io/s/parse-reddit-api-returned-html-h3hfv
rulesUrlList ==>  [
{
  "status": "fulfilled",
  "value": {
    "rule": "Be kind",
    "checkedResults": [
      {
        "status": "fulfilled",
        "value": {
          "exist": true,
          "url": "https://..."
        }
      }
    ]
  }
},]

sidebarUrlList [
  {
    "status": "fulfilled",
    "value": {
      "exist": true,
      "url": "http://facebook.github.io/react/"
    }
  },
]
*/

const brokenLinksOnly = ({ value: { exist } }) => !exist
const buildBody = ({ brokenRules, brokenSidebar }) => {
  let rulesBody = ''
  if (brokenRules.length > 0) {
    rulesBody =
      '## Broken URLs in Rules\n' +
      brokenRules.map(({ value: { rule, checkedResults } }) => {
        const title = `* Rule Name: ${rule}\n`
        const body = checkedResults
          .map(({ value: { url } }) => `  - ${url}`)
          .join('\n')
        return title + body
      })
  }

  let sidebarBody = ''
  if (brokenSidebar.length > 0) {
    sidebarBody =
      '## Broken URLs in Sidebar\n' +
      brokenSidebar.map(({ value: { url } }) => `  - ${url}`).join('\n')
  }

  return rulesBody + '\n' + sidebarBody
}

// https://github.com/actions/toolkit/tree/master/packages/github#usage
async function main() {
  const brokenRules = (await getRulesUrlList(urlMap.rules.url)).filter(
    brokenLinksOnly
  )
  const brokenSidebar = (await getSidebarUrlList(urlMap.sidebar.url)).filter(
    brokenLinksOnly
  )
  const brokenLinkCount = brokenRules.length + brokenSidebar.length
  if (brokenLinkCount === 0) return

  const body = buildBody({ brokenRules, brokenSidebar })
  const title = `${brokenLinkCount} Broken link${brokenLinkCount > 1 &&
    's'} on ${now.toISOString()}`

  const newIssue = await octokit.issues.create({
    ...context.repo,
    owner,
    repo,
    title,
    body
  })

  console.log(`newIssue`, JSON.stringify(newIssue, null, 2))
}

main()
