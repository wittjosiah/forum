const rpcWebsockets = require('rpc-websockets')

async function createWebsocket (endpoint = 'ws://localhost:3000/') {
  const ws = new rpcWebsockets.Client(endpoint)
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws))
    ws.on('error', e => reject(new Error('Connection failed')))
  })
}

async function resumeSession (session) {
  const { userId, sessionId } = session
  const domain = userId.split('@')[1]
  const ws = await createWebsocket(`wss://${domain}`)
  await ws.call('accounts.resumeSession', [sessionId])
  return ws
}

module.exports = {
  createWebsocket,
  resumeSession
}
