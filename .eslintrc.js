// copied from workforce/frontend/utils/eslint-config/index.js

module.exports = {
    extends: ['airbnb', 'airbnb-typescript', 'airbnb/hooks', 'prettier'],
    plugins: ['import', 'react'],
    parserOptions: {
        project: './tsconfig.json',
    },
    rules: {
        // New rules/adjustments
        '@typescript-eslint/semi': ['error', 'never'],
        'one-var': ['error', 'never'],
        semi: ['error', 'never'],
        'react/function-component-definition': [2, { namedComponents: 'arrow-function' }],
    
        // Nice to have, but not on the radar - should come back up for discussion at some point
        'jsx-a11y/alt-text': 0,
        'jsx-a11y/anchor-has-content': 0,
        'jsx-a11y/anchor-is-valid': 0,
        'jsx-a11y/aria-role': 0,
        'jsx-a11y/click-events-have-key-events': 0,
        'jsx-a11y/control-has-associated-label': 0,
        'jsx-a11y/heading-has-content': 0,
        'jsx-a11y/iframe-has-title': 0,
        'jsx-a11y/interactive-supports-focus': 0,
        'jsx-a11y/label-has-associated-control': 0,
        'jsx-a11y/media-has-caption': 0,
        'jsx-a11y/mouse-events-have-key-events': 0,
        'jsx-a11y/no-autofocus': 0,
        'jsx-a11y/no-noninteractive-element-interactions': 0,
        'jsx-a11y/no-noninteractive-element-to-interactive-role': 0,
        'jsx-a11y/no-noninteractive-tabindex': 0,
        'jsx-a11y/no-static-element-interactions': 0,
        'jsx-a11y/tabindex-no-positive': 0,
        radix: 0,
        'react/destructuring-assignment': 0,
        'max-classes-per-file': 0,
        'max-len': 0,
    
        // Gone
        'react/default-props-match-prop-types': 0,
        'react/forbid-prop-types': 0,
        'react/no-unused-prop-types': 0,
        'react/no-unused-state': 0,
        'react/prop-types': 0,
        'react/require-default-props': 0,
        'react/sort-comp': 0,
        'react/state-in-constructor': 0,
        '@typescript-eslint/comma-dangle': 0,
        '@typescript-eslint/dot-notation': 0,
        '@typescript-eslint/no-redeclare': 0,
        'import/no-extraneous-dependencies': 0,
        'import/prefer-default-export': 0,
        'no-plusplus': 0,
        'no-redeclare': 0,
        'object-curly-newline': 0,
        'react/static-property-placement': 0,
    },
    env: {
        browser: true,
        jest: true,
    },
}
