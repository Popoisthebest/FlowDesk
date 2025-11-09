// src/App.js
import React from "react";
import "./App.css";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  NavLink,
  Navigate,
} from "react-router-dom";

import AIMeetingAssistant from "./pages/AIMeetingAssistant";
import ActionSense from "./pages/ActionSense";
import TeamAutoMatching from "./pages/TeamAutoMatching";
import FlowChain from "./pages/FlowChain";
import AIScheduler from "./pages/AIScheduler";
import RewardInsight from "./pages/RewardInsight";

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* 왼쪽 사이드바 */}
        <nav className="left-sidebar">
          <div className="logo">FlowDesk</div>
          <ul>
            <li>
              <NavLink
                to="/ai-meeting-assistant"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                AI 회의 비서
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/actionsense"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                ActionSense
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/flowchain"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                FlowChain
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/team-auto-matching"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                팀 오토 매칭
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/ai-scheduler"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                AI 일정 비서
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/reward-insight"
                className={({ isActive }) => (isActive ? "active" : "")}
                end
              >
                보너스 리워드 지표
              </NavLink>
            </li>
          </ul>
        </nav>

        {/* 오른쪽 콘텐츠 영역 */}
        <main className="content-area">
          <Routes>
            {/* 기본 진입 시 AI 회의 비서로 리다이렉트 */}
            <Route
              path="/"
              element={<Navigate to="/ai-meeting-assistant" replace />}
            />

            <Route
              path="/ai-meeting-assistant"
              element={<AIMeetingAssistant />}
            />
            <Route path="/actionsense" element={<ActionSense />} />
            <Route path="/team-auto-matching" element={<TeamAutoMatching />} />
            <Route path="/flowchain" element={<FlowChain />} />
            <Route path="/ai-scheduler" element={<AIScheduler />} />
            <Route path="/reward-insight" element={<RewardInsight />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
