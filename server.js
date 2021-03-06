require('make-promises-safe')
const path = require('path')

const fastify = require('fastify')({
  logger: {
    prettyPrint: true
  }
})

fastify.register(require('fastify-static'), {
  root: path.join(__dirname, 'static')
})

fastify.register(require('point-of-view'), {
  engine: {
    ejs: require('ejs')
  },
  root: path.join(__dirname, 'views'),
  layout: 'layout.ejs'
})

fastify.get('/', async (request, reply) => {
  return reply.view('index.ejs')
})

const start = async () => {
  try {
    await fastify.listen(3000)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
