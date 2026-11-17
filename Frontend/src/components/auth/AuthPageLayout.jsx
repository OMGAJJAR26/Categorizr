import { MARKETING_SITE_URL } from "../../utils/siteUrls";
import Logo from "../../assets/categorizrLogoSimple.png";
import FontLogo from "../../assets/categorizrFontLogo.png";
import LoginBackground from "../../assets/categorizrlogin.webp";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";


const SLIDES = [
  {
    title: "Track Expenses",
    subtitle: "Keep project spending under control",
  },
  {
    title: "Organize Receipts",
    subtitle: "AI-Based Sorting",
  },
  {
    title: "Visual Reports",
    subtitle: "See where your money goes",
  },
  {
    title: "Maximize Tax Deductions",
    subtitle: "Never Lose another Receipt",
  },
  {
    title: "Create Reports",
    subtitle: "Run Summary and Detailed Reports",
  },
];

const sliderSettings = {
  dots: false,
  arrows: false,
  fade: true,
  infinite: true,
  speed: 450,
  cssEase: "ease-in-out",
  autoplay: true,
  autoplaySpeed: 3000,
  // react-slick pauses autoplay while the pointer is over the slider or it has focus,
  // which made the headlines look stuck on desktop. Keep it moving.
  pauseOnHover: false,
  pauseOnFocus: false,
  pauseOnDotsHover: false,
  slidesToShow: 1,
  slidesToScroll: 1,
};

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]";

// Dark top bar in the style of the main website's own navigation: the logo (a link to the
// website) on the left, and the same "Key Features" / "Contact Us" links on the right,
// pointing at those sections of the website.
const linkClass = `inline-flex items-center min-h-[44px] px-2 sm:px-3 rounded-sm text-[10px] min-[360px]:text-[11px] sm:text-[13px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-white/85 hover:text-white transition whitespace-nowrap ${focusRing}`;

const SiteHeader = () => (
  <header className="relative z-20 bg-[#141414] text-white border-b border-white/10">
    <div className="flex items-center justify-between gap-2 h-16 px-3 sm:px-6 lg:px-10">
      <a
        href={MARKETING_SITE_URL}
        aria-label="Go to the Categorizr website"
        title="Categorizr website"
        className={`flex items-center shrink-0 min-h-[44px] rounded-sm ${focusRing}`}
      >
        <img src={FontLogo} alt="Categorizr" className="h-6 min-[360px]:h-7 sm:h-9 w-auto" />
      </a>

      <nav aria-label="Website" className="flex items-center sm:gap-1">
        <a href={`${MARKETING_SITE_URL}#keyfeatures`} className={linkClass}>
          {/* Shortened to "Features" on the narrowest phones so both links fit. */}
          <span className="hidden min-[400px]:inline">Key&nbsp;</span>Features
        </a>
        <a href={`${MARKETING_SITE_URL}#contactus`} className={linkClass}>
          Contact Us
        </a>
      </nav>
    </div>
  </header>
);

const AuthPageLayout = ({ children }) => (
  <div className="min-h-screen flex flex-col font-dmsans bg-white">
    <SiteHeader />

    {/* Full-page product illustration under the header: shown sharp (no blur) with only a
        light white wash so the dark-blue text stays readable. */}
    <div
      className="fixed inset-x-0 bottom-0 top-16 z-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${LoginBackground})` }}
      aria-hidden
    />
    <div
      className="fixed inset-x-0 bottom-0 top-16 z-0 bg-gradient-to-b from-white/90 via-white/70 to-white/25 lg:bg-gradient-to-r lg:from-white/80 lg:via-white/40 lg:to-white/5"
      aria-hidden
    />

    <main className="relative z-10 flex-1 flex flex-col lg:flex-row">
      {/* Left half: logo and the rotating message, centred both ways. */}
      <section className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6 pt-8 pb-2 lg:p-10 text-center text-blue-900">
        <div className="w-full max-w-xl">
          <img
            src={Logo}
            alt="Categorizr Logo"
            className="h-24 lg:h-32 w-auto mx-auto mb-5 lg:mb-8 drop-shadow-sm"
          />
          <Slider {...sliderSettings} className="auth-hero-slider">
            {SLIDES.map((slide) => (
              <div key={slide.title}>
                <h1 className="auth-slide-title text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
                  {slide.title}
                </h1>
                <p className="auth-slide-sub mt-3 text-lg lg:text-xl font-medium">
                  {slide.subtitle}
                </p>
              </div>
            ))}
          </Slider>
        </div>
      </section>

      <section className="w-full lg:w-1/2 flex items-center justify-center p-6 pb-10 lg:p-10">
        {children}
      </section>
    </main>
  </div>
);

export default AuthPageLayout;
