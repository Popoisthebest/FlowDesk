// src/App.js
import React from "react";
import "./App.css";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  NavLink,
} from "react-router-dom";
import AIMeetingAssistant from "./pages/AIMeetingAssistant";
import ActionSense from "./pages/ActionSense";
import TeamAutoMatching from "./pages/TeamAutoMatching";
import FlowChain from "./pages/FlowChain";
import AIScheduler from "./pages/AIScheduler";
import RewardInsight from "./pages/RewardInsight";

const menuItems = [
  { label: "AI 회의 비서", path: "/ai-meeting-assistant", icon: "📘" },
  { label: "ActionSense", path: "/actionsense", icon: "⚡" },
  { label: "FlowChain", path: "/flowchain", icon: "🔗" },
  { label: "팀 오토 매칭", path: "/team-auto-matching", icon: "👥" },
  { label: "AI 일정 비서", path: "/ai-scheduler", icon: "📅" },
  { label: "보너스 리워드 지표", path: "/reward-insight", icon: "📊" },
];

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* Left Sidebar */}
        <nav className="left-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo-mark">FD</div>
            <div className="sidebar-logo-text">FlowDesk</div>
          </div>

          <ul className="sidebar-menu">
            {menuItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    "sidebar-item" + (isActive ? " active" : "")
                  }
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span className="sidebar-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right Content */}
        <main className="content-area">
          <Routes>
            <Route
              path="/ai-meeting-assistant"
              element={<AIMeetingAssistant />}
            />
            <Route path="/actionsense" element={<ActionSense />} />
            <Route path="/flowchain" element={<FlowChain />} />
            <Route path="/team-auto-matching" element={<TeamAutoMatching />} />
            <Route path="/ai-scheduler" element={<AIScheduler />} />
            <Route path="/reward-insight" element={<RewardInsight />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
