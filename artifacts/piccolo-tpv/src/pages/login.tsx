import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetEmployeeLoginList, useAuthWithPin } from "@workspace/api-client-react";
import { Loader2, Delete } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const { data: employees, isLoading: loadingEmployees } = useGetEmployeeLoginList();
  const auth = useAuthWithPin();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const authMutateRef = useRef(auth.mutate);
  authMutateRef.current = auth.mutate;

  useEffect(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("employee");
  }, []);

  useEffect(() => {
    if (pin.length === 4 && selectedEmployeeId) {
      authMutateRef.current(
        { data: { employeeId: selectedEmployeeId, pin } },
        {
          onSuccess: (res) => {
            localStorage.setItem("token", res.token);
            localStorage.setItem("employee", JSON.stringify(res.employee));
            setLocation(res.employee?.role === "admin" ? "/admin" : "/tables");
          },
          onError: () => {
            setPin("");
            toast.error("Incorrect PIN");
          },
        }
      );
    }
  }, [pin, selectedEmployeeId, setLocation]);

  const handlePinPress = (num: number) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handlePinDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const selectedEmployee = employees?.find(e => e.id === selectedEmployeeId);

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background">
      {/* Left: Employee Selection */}
      <div className="flex-1 p-8 lg:p-12 overflow-y-auto flex flex-col">
        <div className="mb-10">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-xl mb-6 shadow-md">
            P
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Select Profile</h1>
          <p className="text-muted-foreground mt-2 text-lg">Tap your name to start your shift.</p>
        </div>

        {loadingEmployees ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {employees?.map((emp) => {
              const isSelected = selectedEmployeeId === emp.id;
              return (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelectedEmployeeId(emp.id);
                    setPin("");
                  }}
                  className={`
                    flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all active:scale-95
                    ${isSelected 
                      ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(217,119,54,0.15)]" 
                      : "border-border bg-card hover:bg-secondary hover:border-muted-foreground/30"
                    }
                  `}
                >
                  <div className={`
                    w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mb-4
                    ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}
                  `}>
                    {emp.name.charAt(0)}
                  </div>
                  <span className={`font-semibold text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {emp.name}
                  </span>
                  <span className="text-muted-foreground text-sm mt-1">{emp.role}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: PIN Pad */}
      <div className="w-full lg:w-[480px] bg-card border-l border-border flex flex-col shadow-2xl relative z-10">
        <div className="flex-1 flex flex-col justify-center px-10 py-12">
          
          <div className="text-center mb-10 h-24 flex flex-col items-center justify-end">
            {selectedEmployee ? (
              <>
                <p className="text-muted-foreground mb-4">Enter PIN for <span className="font-semibold text-foreground">{selectedEmployee.name}</span></p>
                <div className="flex justify-center gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-5 h-5 rounded-full transition-all duration-200 ${i < pin.length ? "bg-primary scale-110 shadow-[0_0_10px_rgba(217,119,54,0.5)]" : "bg-secondary"}`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Select a profile first</p>
            )}
          </div>

          <div className={`grid grid-cols-3 gap-4 transition-opacity duration-300 ${!selectedEmployee ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => handlePinPress(num)}
                className="aspect-square bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-2xl flex items-center justify-center text-3xl font-mono active:scale-90 transition-transform shadow-sm"
              >
                {num}
              </button>
            ))}
            <div className="aspect-square"></div>
            <button
              onClick={() => handlePinPress(0)}
              className="aspect-square bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-2xl flex items-center justify-center text-3xl font-mono active:scale-90 transition-transform shadow-sm"
            >
              0
            </button>
            <button
              onClick={handlePinDelete}
              className="aspect-square bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-2xl flex items-center justify-center active:scale-90 transition-transform shadow-sm"
            >
              <Delete size={28} strokeWidth={2.5} />
            </button>
          </div>
          
          {auth.isPending && (
             <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center rounded-l-3xl">
               <Loader2 className="w-10 h-10 animate-spin text-primary" />
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
