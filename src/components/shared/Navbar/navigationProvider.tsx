"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { type IntersectionOptions, useInView } from "react-intersection-observer";
import { usePathname } from "next/navigation";

import { navSections, SectionKey } from "components/shared/Navbar/navSections";

type SectionObserversMap = Record<SectionKey, (node?: Element | null) => void>;
interface Context {
  activeSection: SectionKey;
  setActiveSection: (value: SectionKey) => void;
  sectionsRefs: SectionObserversMap;
}

const NavigationContext = createContext<Context>({} as Context);

export const useNavigationContext = () => useContext(NavigationContext);

const observerOptions: IntersectionOptions = {
  root: null,
  rootMargin: "0% 0% 0% 0%",
  threshold: 0.86,
};

const useSectionObserver = (key: SectionKey, setActiveSection: (value: SectionKey) => void) => {
  const observer = useInView(observerOptions);

  useEffect(() => {
    if (!observer.entry?.isIntersecting) return;

    setActiveSection(key);
  }, [observer.entry?.isIntersecting, setActiveSection, key]);

  return observer;
};

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState<SectionKey>(SectionKey.Hero);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith(navSections[SectionKey.Blog].link)) {
      setActiveSection(SectionKey.Blog);

      return;
    }

    if (pathname !== navSections[SectionKey.MeetupEvent].link) return;

    setActiveSection(SectionKey.MeetupEvent);
  }, [pathname]);

  const observerHero = useSectionObserver(SectionKey.Hero, setActiveSection);
  const observerEvents = useSectionObserver(SectionKey.Events, setActiveSection);
  const observerBlog = useSectionObserver(SectionKey.Blog, setActiveSection);
  const observerMeetupEvent = useSectionObserver(SectionKey.MeetupEvent, setActiveSection);
  const observerStats = useSectionObserver(SectionKey.Stats, setActiveSection);
  const observerHistory = useSectionObserver(SectionKey.Story, setActiveSection);

  const sectionsRefs: SectionObserversMap = {
    [SectionKey.Hero]: observerHero.ref,
    [SectionKey.Events]: observerEvents.ref,
    [SectionKey.Blog]: observerBlog.ref,
    [SectionKey.MeetupEvent]: observerMeetupEvent.ref,
    [SectionKey.Stats]: observerStats.ref,
    [SectionKey.Story]: observerHistory.ref,
  };

  return (
    <NavigationContext.Provider value={{ activeSection, setActiveSection, sectionsRefs }}>
      {children}
    </NavigationContext.Provider>
  );
}
