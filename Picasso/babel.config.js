export default {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    ['@babel/preset-typescript', {
      isTSX: true,
      allExtensions: true,
      allowDeclareFields: true
    }],
  ],
  plugins: [
    // Custom plugin to transform import.meta for Jest
    function() {
      return {
        visitor: {
          MetaProperty(path) {
            // Replace import.meta with global.import.meta
            if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
              path.replaceWithSourceString('(global.import && global.import.meta)');
            }
          }
        }
      };
    }
  ],
};
