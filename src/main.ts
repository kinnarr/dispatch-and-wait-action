import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import {wait} from './wait'
import {inspect} from 'util'

async function run(): Promise<void> {
  try {
    const inputs = {
      token: core.getInput('token',{required: true}),
      owner: core.getInput('owner',{required: true}),
      repo: core.getInput('repo',{required: true}),
      eventType: core.getInput('event-type',{required: true}),
      clientPayload: core.getInput('client-payload'),
      timeoutSeconds: parseInt(core.getInput('timeout-seconds') || '600')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    const client = new GitHub(inputs.token)

    await client.repos.createDispatchEvent({
      owner: inputs.owner,
      repo: inputs.repo,
      event_type: inputs.eventType,
      client_payload: JSON.parse(inputs.clientPayload)
    })

    const repositoryDispatchedTime = new Date()
    core.info(`Dispatched at ${repositoryDispatchedTime}`)
    let startedWorkflowRun = undefined
    do {
      await wait(10 * 1000)

      const response = await client.actions.listRepoWorkflowRuns({
        owner: inputs.owner,
        repo: inputs.repo,
        event: 'repository_dispatch',
      });

      startedWorkflowRun = response.data.workflow_runs.filter(function(el) {
        const createdAtDate = new Date(el.created_at)
        return repositoryDispatchedTime <= createdAtDate
      }).sort(function(a, b) {
        const aDate = new Date(a.created_at)
        const bDate = new Date(b.created_at)
        if (aDate > bDate) {
          return 1;
        }
        if (aDate > bDate) {
          return -1;
        }
        return 0;
      })[0]
    } while (startedWorkflowRun == undefined)

    core.info(`Found workflow run started at ${new Date(startedWorkflowRun.created_at)}`)

    let conclusion = 'timed_out'
    core.debug(new Date().toTimeString())

    let now = new Date().getTime()
    const deadline = now + inputs.timeoutSeconds * 1000

    while (now <= deadline) {
      const {data} = await client.actions.getWorkflowRun({
        owner: inputs.owner,
        repo: inputs.repo,
        run_id: startedWorkflowRun.id
      })

      if (data.status === 'completed') {
        conclusion = data.conclusion || "conclusion"
        break
      }

      core.info(
        `Workflow run is not completed, current status is ${data.status}, waiting for ${60} seconds...`
      )
      await wait(60 * 1000)

      now = new Date().getTime()
    }

    core.debug(new Date().toTimeString())

    core.setOutput('conclusion', conclusion)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
