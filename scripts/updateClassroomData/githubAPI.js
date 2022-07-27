const _ = require('lodash')
const { Octokit } = require('octokit')

const MAX_PER_PAGE = 100 // 每页最大饭回数据
class GitHubAPI {
  userCache = {}
  languagesCache = {}
  count = 0
  constructor({ auth, org }) {
    this.auth = auth
    this.org = org
    this.init()
  }

  get api() {
    this.count += 1
    return this._octokit
  }

  async init() {
    try {
      this._octokit = new Octokit({ auth: this.auth })
      this.getAuthenticated()
    } catch (err) {
      throw new Error('initialize Octokit fails: ', err)
    }
  }

  async getAuthenticated() {
    const res = await this.api.rest.users.getAuthenticated()
    console.log('x-ratelimit-remaining: ', res.headers['x-ratelimit-remaining'])
    return res.data.login
  }

  async getRepos(page = 1) {
    try {
      const res = await this.api.request('GET /orgs/{org}/repos', {
        org: this.org,
        per_page: MAX_PER_PAGE,
        page: page
      })
      if (res.data.length === MAX_PER_PAGE) {
        return res.data.concat(this.getRepos(page + 1))
      }
      return res.data
    } catch (err) {
      console.log('fetch repos fail: ', err)
      return []
    }
  }

  async getRepo(repoName) {
    try {
      const res = await this.api.request('GET /repos/{owner}/{repo}', {
        owner: this.org,
        repo: repoName
      })
      return _.pick(res.data, [
        'id',
        'name',
        'default_branch',
        'owner.login',
        'owner.avatar_url',
        'owner.html_url',
        'private',
        'html_url',
        'pushed_at',
        'created_at',
        'updated_at'
      ])
    } catch (err) {
      console.log('fetch repo fail: ', repoName, err)
      return
    }
  }

  async getBranches(repoName) {
    try {
      const res = await this.api.request('GET /repos/{owner}/{repo}/branches', {
        owner: this.org,
        repo: repoName
      })
      return res.data
    } catch (err) {
      console.log(`getBranches: ${err} in ${repoName}`)
      return []
    }
  }

  async getRepoContributors(repoName) {
    try {
      const res = await this.api.request('GET /repos/{owner}/{repo}/contributors', {
        owner: this.org,
        repo: repoName
      })
      return res.data
    } catch (err) {
      console.log(`getRepoContributors: ${err} in ${repoName}`)
      return []
    }
  }

  async getRepoLanguages(repoName, assignmentName) {
    try {
      if (this.languagesCache[assignmentName]) {
        return this.languagesCache[assignmentName]
      }
      const res = await this.api.request('GET /repos/{owner}/{repo}/languages', {
        owner: this.org,
        repo: repoName
      })
      const languages = _.keys(res.data)
      this.languagesCache[assignmentName] = languages
      return languages
    } catch (err) {
      console.log(`getRepoLanguages: ${err} in ${repoName}`)
      return []
    }
  }

  async getRepoCommits(repo, since) {
    try {
      const res = await this.api.request('GET /repos/{owner}/{repo}/commits', {
        owner: this.org,
        repo,
        since,
        per_page: MAX_PER_PAGE
      })
      // return _.filter(res.data, (item) => !item.author).map((item) =>
      //   _.pick(item, ['html_url', 'sha', 'commit.author', 'commit.message'])
      // )
      return _.map(res.data, (item) =>
        _.pick(item, [
          'html_url',
          'sha',
          'author.login',
          'author.type',
          'author.avatar_url',
          'commit.author',
          'commit.message'
        ])
      )
    } catch (err) {
      console.log(`getRepoCommits: ${err}  in ${repo}`)
      return []
    }
  }

  async getUserInfo(student_name) {
    if (this.userCache[student_name]) {
      return this.userCache[student_name]
    }
    try {
      const res = await this.api.request('GET /users/{username}', {
        username: student_name
      })
      const result = _.pick(res.data, 'avatar_url')
      this.userCache[student_name] = result
      return result
    } catch (err) {
      console.log(`NotFound Account: ${student_name}`)
      this.userCache[student_name] = 'NotFound'
      return 'NotFound'
    }
  }
  async getWorkflowRuns(repoName, workflowId) {
    try {
      const res = await this.api.request(
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
        {
          owner: this.org,
          repo: repoName,
          workflow_id: workflowId
        }
      )
      return _.map(res.data.workflow_runs, (run) =>
        _.pick(run, [
          'id',
          'name',
          'path',
          'event',
          'head_branch',
          'conclusion',
          'status',
          'check_suite_id',
          'html_url',
          'run_started_at',
          'updated_at',
          'created_at',
          'triggering_actor.login'
        ])
      )
    } catch (err) {
      console.log(`get_workflow_runs: ${err} in ${repoName} ${workflowId}`)
      return []
    }
  }
  async getJobs(repoName, runId) {
    try {
      const res = await this.api.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
        owner: this.org,
        repo: repoName,
        run_id: runId
      })
      return res.data.jobs.map((item) =>
        _.pick(item, [
          'id',
          'name',
          'html_url',
          'conclusion',
          'status',
          'completed_at',
          'started_at',
          'steps'
        ])
      )
    } catch (err) {
      console.log(`getJobs: ${err} in ${repoName}, ${runId}`)
      return []
    }
  }

  async getClassroomWorkflowId(repoName) {
    try {
      const resWorkflows = await this.api.request('GET /repos/{owner}/{repo}/actions/workflows', {
        owner: this.org,
        repo: repoName
      })
      const classroomWorkflow = resWorkflows.data.workflows.find(
        (workflow) =>
          workflow.name.includes('GitHub Classroom Workflow') ||
          workflow.path.includes('classroom.yml')
      )
      return (classroomWorkflow || {}).id
    } catch (err) {
      console.log(`getClassroomWorkflowId: ${err} in ${repoName}`)
      return undefined
    }
  }
  async getCIInfo(repoName, workflow_id) {
    try {
      const classroomWorkflowId = workflow_id || (await this.getClassroomWorkflowId(repoName))
      if (classroomWorkflowId) {
        const resRuns = await this.getWorkflowRuns(repoName, classroomWorkflowId)
        const runs = await Promise.all(
          resRuns.map(async (item) =>
            _.pick(item, [
              'id',
              'name',
              'event',
              'conclusion',
              'status',
              'check_suite_id',
              'head_branch',
              'html_url',
              'run_started_at',
              'created_at',
              'update_at'
            ])
          )
        )
        return [classroomWorkflowId, runs]
      }
      return []
    } catch (err) {
      console.log(`getCIInfo ${err} in ${repoName}`)
      return []
    }
  }
}

module.exports = {
  GitHubAPI
}
