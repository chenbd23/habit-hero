module.exports = { content: ['./index.html', './src/**/*.{vue,ts}', './services/**/*.ts'], ...{
        theme: {
          extend: {
            colors: {
              paper: '#FFFBEB',
              primary: '#8B5CF6', 
              secondary: '#F472B6',
              accent: '#FCD34D', 
              success: '#4ADE80',
              sky: '#60A5FA',
            },
            boxShadow: {
              'cartoon': '4px 4px 0px 0px #000000',
              'cartoon-sm': '2px 2px 0px 0px #000000',
              'cartoon-lg': '8px 8px 0px 0px #000000',
              'cartoon-inner': 'inset 4px 4px 0px 0px rgba(0,0,0,0.1)',
            },
            borderRadius: {
              'hand': '2rem',
              'blob': '30% 70% 70% 30% / 30% 30% 70% 70%',
            },
            animation: {
              'bounce-slow': 'bounce 3s infinite',
              'wiggle': 'wiggle 1s ease-in-out infinite',
              'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
              wiggle: {
                '0%, 100%': { transform: 'rotate(-3deg)' },
                '50%': { transform: 'rotate(3deg)' },
              },
              float: {
                '0%, 100%': { transform: 'translateY(0)' },
                '50%': { transform: 'translateY(-20px)' },
              }
            }
          },
        },
      } };
