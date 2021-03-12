const path = require('path')
const { routes } = require('./api')

module.exports = async function (fastify, options) {
  fastify
    .register(require('fastify-formbody'))
    .register(require('fastify-cookie'), {
      secret: process.env.COOKIE_SECRET,
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
}
