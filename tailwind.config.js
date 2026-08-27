/** @type {import('tailwindcss').Config} */
export default {
  mode: "jit",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",

    // Or if using `src` directory:
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./styles/**/*.css",

    // 패키지 안의 화면도 스캔한다.
    //
    // 왜
    //   파생 서비스는 이 설정 파일을 그대로 복사해 쓰는데, 그쪽 저장소에는
    //   components 폴더가 없다. 화면은 전부 node_modules/brunner-template 에서
    //   온다. 위 글로브만 두면 Tailwind 가 컴포넌트 마크업을 한 줄도 못 보고,
    //   거기 쓰인 유틸리티 클래스를 아예 만들지 않는다. 그러면 파생 서비스의
    //   화면은 클래스는 붙어 있는데 규칙이 없는 상태로 떠서, 모달이 각진 흰
    //   상자로 나오는 식으로 통째로 투박해진다. CSS 파일이 없는 것이 아니라
    //   필요한 규칙이 안 만들어진 것이라 원인을 찾기도 어렵다.
    //
    //   이 저장소 자신에게는 이 경로가 없으므로 아무것도 더 만들지 않는다.
    //   파생 서비스가 같은 파일을 복사해 가도 그대로 맞게 두려고 여기에 둔다.
    "./node_modules/brunner-template/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/brunner-template/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/brunner-template/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["class", ".dark"],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        // 투명도 수식(/10, /40 …)을 쓸 수 있는 색.
        // var() 색에는 Tailwind 가 알파를 못 끼우므로 채널 변수로 등록한다.
        // 자세한 배경은 styles/globals.css 의 --*-rgb 주석 참고.
        "brand-blue": "rgb(var(--brand-blue-rgb) / <alpha-value>)",
        "brand-violet": "rgb(var(--brand-violet-rgb) / <alpha-value>)",
        success: "rgb(var(--success-rgb) / <alpha-value>)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
        "brand-emerald": "rgb(var(--brand-emerald-rgb) / <alpha-value>)",
        // 테마 연동색(다크에서 값이 lib/themes.js 로부터 런타임에 온다).
        // 이름이 이미 쓰이고 있는 둘은 다르게 붙였다.
        //   page      → --bg      (background 는 shadcn 이 선점)
        //   line      → --border  (border 는 shadcn 이 선점)
        //   reader-bg → --general-text-bg-color
        page: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-alt": "rgb(var(--surface-alt-rgb) / <alpha-value>)",
        line: "rgb(var(--border-rgb) / <alpha-value>)",
        "reader-bg": "rgb(var(--general-text-bg-color-rgb) / <alpha-value>)",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
    screens: {
      xs: "360px",
      sm: "640px",
      md: "768px",
      tablet: "768px",
      lg: "1024px",
      desktop: "1024px",
      xl: "1280px",
      laptop: "1200px",
    },
  },
  plugins: [require("tailwindcss-animate")],
};
