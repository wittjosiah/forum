const R = require('ramda')
const colorHash = new (require('color-hash'))()
const TimeAgo = require('javascript-time-ago')
const en = require('javascript-time-ago/locale/en')
const { createWebsocket, resumeSession } = require('../lib/ws.js')
const { avatarUrl, blobUrl, commentUrl, postUrl, linkify, shorten } = require('../lib/strings.js')

const DEFAULT_COMMUNITIES = [
  'alphatesters@ctzn.one',
  'welcome@ctzn.one',
  'ktzns@ctzn.one',
  'quotes@ctzn.one',
  'gameboard@ctzn.one',
  'P2P@ctzn.one',
  'mlai@ctzn.one',
  'rustaceans@ctzn.one',
  'python@ctzn.one',
  'GeminiEnthusiasts@ctzn.one',
  'sports@ctzn.one',
  'Hamradio@ctzn.one'
]
const DEFAULT_HOST = 'wss://ctzn.one'

TimeAgo.addDefaultLocale(en)
const timeAgo = new TimeAgo('en-US')

async function routes (fastify, options) {
  fastify.get('/', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)

    const listMemberships = id => {
      if (!id) return Promise.resolve([])
      return ws.call('communities.listMemberships', [id])
    }

    const memberships = await R.pipe(
      R.prop('userId'),
      listMemberships,
      R.andThen(R.map(entry => entry.value.community.userId))
    )(session)

    const communities =
      await R.pipe(
        R.union(memberships),
        R.map(communityId => ws.call('profiles.get', [communityId])),
        R.bind(Promise.all, Promise),
        R.andThen(R.map(community => {
          community.joined = R.includes(community.userId, memberships)
          community.colorHash = colorHash.hex(community.userId)
          community.avatarUrl = avatarUrl(community.userId)
          return community
        }))
      )(DEFAULT_COMMUNITIES)

    const joinedCommunities = R.filter(({ joined }) => joined, communities)
    const otherCommunities = R.filter(({ joined }) => !joined, communities)

    return reply.view('index.ejs', { session, joinedCommunities, otherCommunities })
  })

  fastify.get('/login', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    if (!session) return reply.view('login.ejs', { session })
    return reply.redirect('/')
  })

  fastify.post('/login', async (request, reply) => {
    const { userId, password } = request.body
    if (!userId) return reply.code(400).send()

    const [username, domain] = userId.split('@')
    const ws = await createWebsocket(`wss://${domain}`)
    const session = await ws.call('accounts.login', [{ username, password }])
    return reply
      .setCookie('session', JSON.stringify(session), { httpOnly: true, signed: true })
      .redirect('/')
  })

  fastify.get('/logout', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)
    await ws.call('accounts.logout', [])
    return reply
      .clearCookie('session')
      .redirect('/')
  })

  fastify.get('/profile', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)
    const profile = await ws.call('profiles.get', [session.userId])
    profile.avatarUrl = avatarUrl(profile.userId)
    const feed = []
    return reply.view('profile.ejs', { session, profile, feed })
  })

  fastify.post('/join', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    if (!session) return reply.redirect('/login')
    const ws = await getSocket(session)

    const { communityId } = request.body
    await ws.call('communities.join', [communityId])

    return reply.redirect(`/${communityId}`)
  })

  fastify.post('/post', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)

    const { communityId, communityUrl, text, extendedText } = request.body
    const post = {
      community: {
        userId: communityId,
        dbUrl: communityUrl
      },
      text,
      extendedText
    }
    const { key } = await ws.call('posts.create', [post])
    const redirectUrl = postUrl({ key, author: { userId: session.userId } })

    return reply.redirect(redirectUrl)
  })

  fastify.post('/comment', async (request, reply) => {
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)

    const { communityId, communityUrl, rootDbUrl, rootAuthorId, parentDbUrl, parentAuthorId, text } = request.body
    const root = {
      dbUrl: rootDbUrl,
      authorId: rootAuthorId
    }
    const parent = {
      dbUrl: parentDbUrl,
      authorId: parentAuthorId
    }
    const commentReply = {
      root,
      parent: rootDbUrl !== parentDbUrl ? parent : undefined
    }
    const comment = {
      community: {
        userId: communityId,
        dbUrl: communityUrl
      },
      reply: commentReply,
      text
    }
    await ws.call('comments.create', [comment])

    const postKey = R.last(rootDbUrl.split('/'))
    const redirectUrl = postUrl({ key: postKey, author: { userId: session.userId } })

    return reply.redirect(redirectUrl)
  })

  fastify.get('/:userId/ctzn.network/post/:key', async (request, reply) => {
    const { userId, key } = request.params
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)
    const post = await R.pipe(
      () => ws.call('posts.get', [userId, key]),
      R.andThen(post => prepPost(post, false)),
      R.andThen(post => hydrateCommunity(post, ws))
    )()
    const comments = await R.pipe(
      () => ws.call('comments.getThread', [post.dbUrl]),
      R.andThen(R.map(prepComment)),
      R.andThen(unfoldThread)
    )()
    return reply.view('post.ejs', { session, post, comments })
  })

  fastify.get('/:userId', async (request, reply) => {
    const { userId } = request.params
    const { lt } = request.query
    const session = parseSessionCookie(request.cookies.session)
    const ws = await getSocket(session)

    const profile = await ws.call('profiles.get', [userId])
    const isCommunity = profile.dbType === 'ctzn.network/public-community-db'
    profile.avatarUrl = avatarUrl(profile.userId)

    const feed = await R.pipeWith(R.andThen, [
      () => ws.call('posts.listUserFeed', [userId, { limit: 15, lt, reverse: true }]),
      R.map(post => prepPost(post, isCommunity))
    ])()

    const next = R.compose(R.prop('key'), R.last)(feed)
    const path = request.url.split('?')[0]
    const nextPage = `${path}?lt=${next}`

    if (isCommunity) {
      const listMemberships = id => {
        if (!id) return Promise.resolve([])
        return ws.call('communities.listMemberships', [id])
      }

      const memberships = await R.pipe(
        R.prop('userId'),
        listMemberships,
        R.andThen(R.map(entry => entry.value.community.userId))
      )(session)

      const joined = R.includes(profile.userId, memberships)
      const community = { joined, ...profile }

      return reply.view('community.ejs', { session, community, feed, nextPage })
    } else {
      return reply.view('profile.ejs', { session, profile, feed, nextPage })
    }
  })
}

function parseSessionCookie (cookieStr) {
  if (!cookieStr) return
  return JSON.parse(cookieStr.split('.').slice(0, -1).join('.'))
}

function getSocket (session) {
  return session ? resumeSession(session) : createWebsocket(DEFAULT_HOST)
}

function prepPost (post, isCommunity) {
  post.dbUrl = post.url
  post.url = postUrl(post)
  post.value.createdAt = new Date(post.value.createdAt)
  post.value.timeAgo = timeAgo.format(post.value.createdAt)
  post.author.avatarUrl = avatarUrl(post.author.userId)
  post.value.text = isCommunity ? shorten(post.value.text, 96) : linkify(post.value.text)
  post.value.extendedText = post.value.extendedText ? linkify(post.value.extendedText) : undefined
  if (post.value.media) {
    post.value.media = R.map(media => {
      media.blobs.original.url = blobUrl(post.author.userId, media.blobs.original.blobName)
      media.blobs.thumb.url = blobUrl(post.author.userId, media.blobs.thumb.blobName)
      return media
    }, post.value.media)
  }
  return post
}

async function hydrateCommunity (post, ws) {
  post.value.community = await ws.call('profiles.get', [post.value.community.userId])
  post.value.community.avatarUrl = avatarUrl(post.value.community.userId)
  return post
}

function prepComment (comment) {
  comment.dbUrl = comment.url
  comment.url = commentUrl(comment)
  comment.value.text = linkify(comment.value.text)
  comment.value.createdAt = new Date(comment.value.createdAt)
  comment.value.timeAgo = timeAgo.format(comment.value.createdAt)
  comment.author.avatarUrl = avatarUrl(comment.author.userId)
  if (comment.replies) comment.replies = R.map(prepComment, comment.replies)
  return comment
}

function unfoldThread (comments) {
  return R.pipe(
    R.map(unfoldComment),
    R.flatten(),
    R.sortBy(R.compose(R.prop('createdAt'), R.prop('value')))
  )(comments)
}

function unfoldComment (comment, parent) {
  const parentReply = R.compose(
    R.prop('parent'),
    R.prop('reply'),
    R.prop('value')
  )(comment)

  if (parentReply) {
    parentReply.snippet = shorten(parent.value.text, 64)
    parentReply.avatarUrl = avatarUrl(parent.author.userId)
    parentReply.displayName = parent.author.displayName
  }

  if (!comment.replies) return comment

  return [comment, R.map(reply => unfoldComment(reply, comment), comment.replies)]
}

module.exports = {
  routes: routes
}
