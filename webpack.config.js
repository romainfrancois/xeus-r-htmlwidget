const path = require('path');

module.exports = {
  module: {
    rules: [
      {
        include: path.resolve(__dirname, 'r/inst/widget/frame.js'),
        type: 'asset/resource'
      }
    ]
  }
};
