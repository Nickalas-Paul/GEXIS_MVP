// Metro cannot process non-literal dynamic import() used by mapbox-gl.
// Workaround from mapbox/mapbox-gl-js#13650
module.exports = function ({ types: t }) {
  return {
    visitor: {
      ImportExpression(path) {
        if (!path.node.source || path.node.source.type !== 'StringLiteral') {
          path.replaceWith(
            t.callExpression(
              t.newExpression(t.identifier('Function'), [
                t.stringLiteral('url'),
                t.stringLiteral('return import(url)'),
              ]),
              [path.node.source]
            )
          );
        }
      },
    },
  };
};
