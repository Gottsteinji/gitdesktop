import { Dispatcher, AppStore, ErrorHandler } from './index'
import { SelectionType } from '../app-state'
import { GitError } from '../git/core'
import { GitError as GitErrorType } from 'git-kitchen-sink'

/** Handle errors by presenting them. */
export async function defaultErrorHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
  await dispatcher.presentError(error)

  return null
}

/** Create a new missing repository error handler with the given AppStore. */
export function missingRepositoryHandler(appStore: AppStore): ErrorHandler {
  return async (error: Error, dispatcher: Dispatcher) => {
    const appState = appStore.getState()
    const selectedState = appState.selectedState
    if (!selectedState) {
      return error
    }

    if (selectedState.type !== SelectionType.MissingRepository && selectedState.type !== SelectionType.Repository) {
      return error
    }

    const repository = selectedState.repository
    if (repository.missing) {
      return null
    }

    const missing =
      error instanceof GitError && error.result.gitError === GitErrorType.NotAGitRepository

    if (missing) {
      await dispatcher.updateRepositoryMissing(selectedState.repository, true)
      return null
    }

    return error
  }
}
