/* Largely from https://github.com/pfrazee/ctznry */
/* eslint-disable no-useless-escape */

function parseUserId (userId) {
  if (!userId) return { username: undefined, domain: undefined }
  if (userId.includes('@')) {
    const [username, domain] = userId.split('@')
    return { username, domain }
  }
  return { username: userId, domain: userId }
}

function shorten (str, n = 6) {
  if (str.length > (n + 3)) {
    return str.slice(0, n) + '...'
  }
  return str
}

function joinPath (...args) {
  let str = args[0]
  for (let v of args.slice(1)) {
    v = v && typeof v === 'string' ? v : ''
    const left = str.endsWith('/')
    const right = v.startsWith('/')
    if (left !== right) str += v
    else if (left) str += v.slice(1)
    else str += '/' + v
  }
  return str
}

const URL_RE = /(http|https|hyper):\/\/([a-z0-9\-._~:/\?#\[\]@!$&'\(\)*+,;=%]+)/gi
const PUNCTUATION_RE = /[^a-z0-9]$/i
const OPEN_PARENS_RE = /\(/g
const CLOSE_PARENS_RE = /\)/g
const OPEN_SQBRACKETS_RE = /\[/g
const CLOSE_SQBRACKETS_RE = /\]/g
function linkify (str = '') {
  return str.replace(URL_RE, match => {
    // remove trailing punctuation
    let trailingChars = ''
    while (match.length && PUNCTUATION_RE.test(match)) {
      const char = match.charAt(match.length - 1)
      if (char === ')' || char === ']') {
        // closing brackets require us to balance
        const openCount = match.match((char === ')' ? OPEN_PARENS_RE : OPEN_SQBRACKETS_RE))?.length || 0
        const closeCount = match.match((char === ')' ? CLOSE_PARENS_RE : CLOSE_SQBRACKETS_RE))?.length || 0
        if (closeCount <= openCount) {
          // this char seems to close an opening bracket in the URL so consider it a part of the URL
          break
        }
      }
      match = match.slice(0, match.length - 1)
      trailingChars += char
    }
    return `<a class="text-blue-600 hover:underline" href="${match}">${match}</a>${trailingChars}`
  })
}

function avatarUrl (userId) {
  const { domain, username } = parseUserId(userId)
  return joinPath(`https://${domain}`, 'ctzn/avatar', username)
}

function blobUrl (userId, blobName) {
  const { domain } = parseUserId(userId)
  return joinPath(`https://${domain}`, 'ctzn/blobs', userId, blobName)
}

function commentUrl (comment) {
  return '/' + joinPath(comment.author.userId, 'ctzn.network/comment', comment.key)
}

function postUrl (post) {
  return '/' + joinPath(post.author.userId, 'ctzn.network/post', post.key)
}

module.exports = {
  parseUserId,
  shorten,
  joinPath,
  linkify,
  avatarUrl,
  blobUrl,
  commentUrl,
  postUrl
}
