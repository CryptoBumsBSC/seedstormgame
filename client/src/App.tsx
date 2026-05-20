import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Game from "@/pages/game";
import Admin from "@/pages/admin";
import Hub from "@/pages/hub";
import PhotonWars from "@/pages/photon-wars";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Hub} />
      <Route path="/seed-storm" component={Game} />
      <Route path="/photon-wars" component={PhotonWars} />
      <Route path="/admin" component={Admin} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
