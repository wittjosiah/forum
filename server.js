require('make-promises-safe')
const path = require('path')
const { routes } = require('./api')

const fastify = require('fastify')({
  logger: true
})

fastify
  .register(require('fastify-formbody'))
  .register(require('fastify-cookie'), {
    secret: 'my-secret', // TODO
    parseOptions: {}
  })
  .register(require('fastify-static'), {
    root: path.join(__dirname, 'static')
  })
  .register(require('point-of-view'), {
    engine: {
      ejs: require('ejs')
    },
    root: path.join(__dirname, 'views'),
    layout: 'layout.ejs'
  })
  .after(() => routes(fastify))

const start = async () => {
  try {
    await fastify.listen(3000)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
