public class Deadlock {
  private static final Object A = new Object();
  private static final Object B = new Object();
  public static void main(String[] args) throws Exception {
    Thread t1 = new Thread(() -> {
      synchronized (A) {
        sleep(200);
        synchronized (B) { System.out.println("t1"); }
      }
    }, "deadlock-t1");
    Thread t2 = new Thread(() -> {
      synchronized (B) {
        sleep(200);
        synchronized (A) { System.out.println("t2"); }
      }
    }, "deadlock-t2");
    t1.start();
    t2.start();
    Thread.sleep(800);
    System.out.println("DEADLOCK_READY");
    System.out.flush();
    Thread.sleep(30000);
  }
  static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) {} }
}
