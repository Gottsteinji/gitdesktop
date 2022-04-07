import memoizeOne from 'memoize-one'
import { GitHubRepository } from '../../models/github-repository'
import { EmojiFilter } from './emoji-filter'
import { IssueLinkFilter } from './issue-link-filter'
import { IssueMentionFilter } from './issue-mention-filter'
import { MentionFilter } from './mention-filter'
import { VideoLinkFilter } from './video-link-filter'
import { VideoTagFilter } from './video-tag-filter'
import { TeamMentionFilter } from './team-mention-filter'
import { CommitMentionFilter } from './commit-mention-filter'
import { CommitMentionLinkFilter } from './commit-mention-link-filter'

export interface INodeFilter {
  /**
   * Creates a document tree walker filtered to the nodes relevant to the node filter.
   *
   * Examples:
   * 1) An Emoji filter operates on all text nodes, but not inside pre or code tags.
   * 2) The issue mention filter operates on all text nodes, but not inside pre, code, or anchor tags
   */
  createFilterTreeWalker(doc: Document): TreeWalker

  /**
   * This filter accepts a document node and searches for it's pattern within it.
   *
   * If found, returns an array of nodes to replace the node with.
   *    Example: [Node(contents before match), Node(match replacement), Node(contents after match)]
   * If not found, returns null
   *
   * This is asynchronous as some filters have data must be fetched or, like in
   * emoji, the conversion to base 64 data uri is asynchronous
   * */
  filter(node: Node): Promise<ReadonlyArray<Node> | null>
}

/**
 * Builds an array of node filters to apply to markdown html. Referring to it as pipe
 * because they will be applied in the order they are entered in the returned
 * array. This is important as some filters impact others.
 *
 * @param emoji Map from the emoji shortcut (e.g., :+1:) to the image's local path.
 */
export const buildCustomMarkDownNodeFilterPipe = memoizeOne(
  (
    emoji: Map<string, string>,
    repository: GitHubRepository
  ): ReadonlyArray<INodeFilter> => [
    new IssueMentionFilter(repository),
    new IssueLinkFilter(repository),
    new EmojiFilter(emoji),
    // Note: TeamMentionFilter was placed before MentionFilter as they search
    // for similar patterns with TeamMentionFilter having a larger application.
    // @org/something vs @username. Thus, even tho the MentionFilter regex is
    // meant to prevent this, in case a username could be encapsulated in the
    // team mention like @username/something, we do the team mentions first to
    // eliminate the possibility.
    new TeamMentionFilter(repository),
    new MentionFilter(repository),
    new CommitMentionFilter(repository),
    new CommitMentionLinkFilter(repository),
    new VideoTagFilter(),
    new VideoLinkFilter(),
  ]
)

/**
 * Method takes an array of node filters and applies them to a markdown string.
 *
 * It converts the markdown string into a DOM Document. Then, iterates over each
 * provided filter. Each filter will have method to create a tree walker to
 * limit the document nodes relative to the filter's purpose. Then, it will
 * replace any affected node with the node(s) generated by the node filter. If a
 * node is not impacted, it is not replace.
 */
export async function applyNodeFilters(
  nodeFilters: ReadonlyArray<INodeFilter>,
  parsedMarkdown: string
): Promise<string> {
  const mdDoc = new DOMParser().parseFromString(parsedMarkdown, 'text/html')

  for (const nodeFilter of nodeFilters) {
    await applyNodeFilter(nodeFilter, mdDoc)
  }

  return mdDoc.documentElement.innerHTML
}

/**
 * Method uses a NodeFilter to replace any nodes that match the filters tree
 * walker and filter change criteria.
 *
 * Note: This mutates; it does not return a changed copy of the DOM Document
 * provided.
 */
async function applyNodeFilter(
  nodeFilter: INodeFilter,
  mdDoc: Document
): Promise<void> {
  const walker = nodeFilter.createFilterTreeWalker(mdDoc)

  let textNode = walker.nextNode()
  while (textNode !== null) {
    const replacementNodes = await nodeFilter.filter(textNode)
    const currentNode = textNode
    textNode = walker.nextNode()
    if (replacementNodes === null) {
      continue
    }

    for (const replacementNode of replacementNodes) {
      currentNode.parentNode?.insertBefore(replacementNode, currentNode)
    }
    currentNode.parentNode?.removeChild(currentNode)
  }
}
