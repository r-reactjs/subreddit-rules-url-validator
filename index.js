// https://github.com/actions/hello-world-javascript-action/blob/master/index.js
const core = require('@actions/core')
const github = require('@actions/github')
const decode = require('unescape')
const cheerio = require('cheerio')
const allSettled = require('promise.allsettled')
const fetch = require('isomorphic-fetch')

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return /4\d\d/.test(response.status) === false
  } catch (error) {
    return false
  }
}

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

  const checkedResults = (await allSettled(checkPromises)).filter(
    ({ value }) => !value.exist
  )
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

    const brokenLinks = await allSettled(brokenPromises)
    return brokenLinks.filter(link => link.value.checkedResults.length > 0)
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

    return (await allSettled(checkPromises)).filter(({ value }) => !value.exist)
  } catch (error) {
    Promise.reject(error)
  }
}

/*
brokenRules [
  {
    "status": "fulfilled",
    "value": {
      "rule": "Be kind",
      "checkedResults": [
        {
          "status": "fulfilled",
          "value": {
            "exist": false,
            "url": "https://www.reddithelp.com/en/categories/reddit-101/reddit-basics/reddiquette"
          }
        }
      ]
    }
  },
]

brokenSidebar [
  {
    "status": "fulfilled",
    "value": {
      "exist": false,
      "url": "http://facebook.github.io/react/"
    }
  },
  {
    "status": "fulfilled",
    "value": {
      "exist": false,
      "url": "https://reactjs.org/docs/getting-started.html"
    }
  },
]
*/

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

  let footer = `
---

Check out broken links above, xxmarkerikson, xxsw-yx, @dance2die, xxjimmytimmons
  `

  return rulesBody + '\n' + sidebarBody + '\n' + footer
}

// https://github.com/actions/toolkit/tree/master/packages/github#usage
async function main() {
  const brokenRules = await getRulesUrlList(urlMap.rules.url)
  const brokenSidebar = await getSidebarUrlList(urlMap.sidebar.url)
  const brokenLinkCount = brokenRules.length + brokenSidebar.length
  if (brokenLinkCount === 0) return

  console.info(`brokenRules`, JSON.stringify(brokenRules, null, 2))
  console.info(`brokenSidebar`, JSON.stringify(brokenSidebar, null, 2))

  const body = buildBody({ brokenRules, brokenSidebar })
  const title = `${brokenLinkCount} Broken link${brokenLinkCount > 1 &&
    's'} on ${new Date().toISOString()}`

  console.info(`Total broken link count:`, brokenLinkCount)

  const assignees = ['dance2die', 'xxmarkerikson', 'xxsw-yx', 'xxjimmytimmons']
  const newIssue = await octokit.issues.create({
    ...context.repo,
    owner,
    repo,
    title,
    body,
    assignees
  })

  // console.log(`newIssue`, JSON.stringify(newIssue, null, 2))
}

main()
