public class GcLoad {
  public static void main(String[] args) throws Exception {
    long end = System.currentTimeMillis() + 3000;
    int round = 0;
    while (System.currentTimeMillis() < end) {
      byte[][] batch = new byte[64][];
      for (int i = 0; i < batch.length; i++) batch[i] = new byte[64 * 1024];
      if ((++round % 50) == 0) System.out.println("round=" + round);
    }
    System.out.println("GC_LOAD_DONE rounds=" + round);
  }
}
